"use client";

/* eslint-disable @next/next/no-img-element -- previews use local blob URLs, which next/image cannot optimize */

import { useEffect, useMemo, useRef, useState } from "react";

export type ReceivingItem = {
  code: string;
  barcode: string;
  product: string;
  unit: string;
  expected: number;
  batch: string;
  validity: string;
};

export type ReceivingPayload = {
  documentType: "NF-e" | "CT-e" | "";
  accessKey: string;
  invoiceNumber: string;
  series: string;
  issueDate: string;
  supplier: string;
  supplierCnpj: string;
  totalValue: number | null;
  responsible: string;
  entryDateTime: string;
  notes: string;
  attachmentUrl: string | null;
  attachmentMimeType: string;
  hasXml: boolean;
  items: ReceivingItem[];
};

type DocumentData = {
  type: "NF-e" | "CT-e" | "";
  accessKey: string;
  number: string;
  series: string;
  issue: string;
  supplier: string;
  cnpj: string;
  uf: string;
  model: string;
  value: number | null;
  items: ReceivingItem[];
};

type Props = {
  onNavigate: (tab: "Recebimento" | "Conferencia" | "Inventario" | "Relatorio") => void;
  onStart: (payload: ReceivingPayload) => void;
};

const emptyDocument: DocumentData = {
  type: "", accessKey: "", number: "", series: "", issue: "",
  supplier: "", cnpj: "", uf: "", model: "", value: null, items: [],
};

const actionClass = "group flex min-h-28 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md";

export default function ReceivingWorkspace({ onNavigate, onStart }: Props) {
  const [document, setDocument] = useState<DocumentData>(emptyDocument);
  const [mode, setMode] = useState<"xml" | "key" | "attachment" | "manual" | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [status, setStatus] = useState("Aguardando captura");
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [manualSupplier, setManualSupplier] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [attachment, setAttachment] = useState<{ file: File; url: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [xmlFingerprint, setXmlFingerprint] = useState("");
  const xmlRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const digits = keyInput.replace(/\D/g, "").slice(0, 44);
  const keyComplete = digits.length === 44;
  const keyValid = keyComplete && validateAccessKey(digits);
  const keyState = !digits ? "Aguardando captura" : !keyComplete ? "Chave em validação" : keyValid ? "Chave válida" : "Chave inválida";
  const effectiveNumber = document.number || manualNumber;
  const effectiveSupplier = document.supplier || manualSupplier;
  const effectiveDate = document.issue || manualDate;
  const hasManualMinimum = Boolean(manualNumber.trim() && manualSupplier.trim() && manualDate && responsible.trim());
  const hasDocumentMinimum = Boolean((document.accessKey && validateAccessKey(document.accessKey)) || hasManualMinimum);

  useEffect(() => () => {
    if (attachment) URL.revokeObjectURL(attachment.url);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [attachment]);

  const formattedKey = useMemo(() => digits.match(/.{1,4}/g)?.join(" ") ?? "", [digits]);

  async function importXml(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xml")) {
      setMessage({ tone: "error", text: "Selecione um arquivo XML válido (.xml)." });
      return;
    }
    setStatus("Documento em análise");
    try {
      const text = await file.text();
      const parsed = parseFiscalXml(text);
      const fingerprint = `${file.name}:${file.size}:${hashText(text)}`;
      if (findDuplicate(parsed.accessKey, fingerprint, parsed.number, parsed.supplier, parsed.issue)) {
        const open = window.confirm("Já existe um recebimento com este documento. Deseja abrir o recebimento existente?");
        setMessage({ tone: "info", text: open ? "O recebimento existente está nesta sessão. Os dados atuais foram mantidos." : "Importação cancelada para evitar duplicidade." });
        setStatus("Aguardando captura");
        return;
      }
      setDocument(parsed);
      setKeyInput(parsed.accessKey);
      setManualNumber(parsed.number);
      setManualSupplier(parsed.supplier);
      setManualDate(toDateTimeLocal(parsed.issue));
      setXmlFingerprint(fingerprint);
      setStatus("Documento identificado");
      setMessage({ tone: "success", text: `${parsed.type} identificada com sucesso. ${parsed.items.length} item(ns) importado(s).` });
    } catch (error) {
      setDocument(emptyDocument);
      setStatus("Aguardando captura");
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "XML incompatível ou corrompido." });
    } finally {
      if (xmlRef.current) xmlRef.current.value = "";
    }
  }

  function applyKey(value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 44);
    setKeyInput(clean);
    if (clean.length !== 44) {
      setStatus(clean ? "Chave em validação" : "Aguardando captura");
      return;
    }
    if (!validateAccessKey(clean)) {
      setStatus("Chave inválida");
      setMessage({ tone: "error", text: "Chave inválida: o dígito verificador não confere." });
      return;
    }
    const identified = identifyAccessKey(clean);
    setDocument((current) => ({ ...current, ...identified, accessKey: clean }));
    setManualNumber(identified.number ?? "");
    setStatus("Documento identificado");
    setMessage({ tone: "success", text: "Chave válida. Documento identificado pelos dados contidos na chave." });
  }

  async function startCamera() {
    setCameraError("");
    if (!("mediaDevices" in navigator) || !("BarcodeDetector" in window)) {
      setCameraError("A leitura pela câmera não está disponível neste navegador. Você ainda pode digitar ou colar a chave.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOpen(true);
      setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // BarcodeDetector ainda não faz parte dos tipos estáveis do TypeScript.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code", "code_128", "itf"] });
        const scan = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const found = String(codes[0]?.rawValue ?? "").replace(/\D/g, "");
            if (found.length >= 44) { applyKey(found.slice(0, 44)); stopCamera(); return; }
          } catch { /* tenta o próximo quadro */ }
          requestAnimationFrame(scan);
        };
        requestAnimationFrame(scan);
      });
    } catch {
      setCameraError("Não foi possível acessar a câmera. Verifique a permissão e use a digitação ou colagem.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  function selectAttachment(file?: File) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setMessage({ tone: "error", text: "Anexe um arquivo JPG, JPEG, PNG ou PDF." });
      return;
    }
    if (attachment) URL.revokeObjectURL(attachment.url);
    setAttachment({ file, url: URL.createObjectURL(file) });
    setMessage({ tone: "success", text: "Anexo adicionado. Nenhum OCR foi executado." });
  }

  function cancelReceiving() {
    if (!window.confirm("Cancelar este recebimento e apagar os dados em andamento?")) return;
    if (attachment) URL.revokeObjectURL(attachment.url);
    setDocument(emptyDocument); setKeyInput(""); setStatus("Aguardando captura"); setMessage(null);
    setResponsible(""); setNotes(""); setManualNumber(""); setManualSupplier(""); setManualDate("");
    setAttachment(null); setXmlFingerprint(""); setMode(null);
  }

  function beginConference() {
    if (!hasDocumentMinimum) {
      setMessage({ tone: "error", text: "Informe uma chave válida ou preencha número, fornecedor, responsável e data/hora." });
      return;
    }
    const duplicate = findDuplicate(document.accessKey, xmlFingerprint, effectiveNumber, effectiveSupplier, effectiveDate);
    if (duplicate && !window.confirm("Já existe um recebimento com este documento. Deseja abrir o recebimento existente?\n\nOK abre a Conferência; Cancelar mantém esta tela.")) return;
    rememberDocument(document.accessKey, xmlFingerprint, effectiveNumber, effectiveSupplier, effectiveDate);
    setStatus("Em conferência");
    onStart({
      documentType: document.type,
      accessKey: document.accessKey,
      invoiceNumber: effectiveNumber,
      series: document.series,
      issueDate: document.issue,
      supplier: effectiveSupplier,
      supplierCnpj: document.cnpj,
      totalValue: document.value,
      responsible,
      entryDateTime: effectiveDate,
      notes,
      attachmentUrl: attachment?.url ?? null,
      attachmentMimeType: attachment?.file.type ?? "",
      hasXml: Boolean(xmlFingerprint),
      items: document.items,
    });
  }

  return (
    <div className="receiving-shell min-h-screen bg-[#f3f6fa] text-slate-950">
      <aside className="receiving-sidebar no-print">
        <div className="mb-8 flex items-center gap-3 px-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-400 font-black text-[#071c35]">SS</span><div><strong>StockScan</strong><p className="text-xs text-blue-200">PRO</p></div></div>
        {[['Recebimento','Recebimento'],['Conferencia','Conferência'],['Inventario','Inventário'],['Relatorio','Relatórios']].map(([id,label]) => <button className={`sidebar-link ${id === 'Recebimento' ? 'sidebar-link-active' : ''}`} key={id} onClick={() => onNavigate(id as Parameters<Props['onNavigate']>[0])} type="button">{label}</button>)}
        <button className="sidebar-link mt-auto" onClick={() => window.location.assign('/documentos')} type="button">Documentos</button>
      </aside>

      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <header className="mb-6"><p className="text-sm font-semibold text-blue-700">Operação de entrada</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Recebimento de Mercadoria</h1><p className="mt-2 text-sm text-slate-600">Capture o documento fiscal, revise os dados e inicie a conferência física.</p></header>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Novo recebimento</h2><p className="mt-1 text-sm text-slate-500">Como deseja identificar o documento?</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{status}</span></div>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <button className={actionClass} onClick={() => { setMode('xml'); xmlRef.current?.click(); }} type="button"><ActionIcon>XML</ActionIcon><span className="font-bold">Importar XML</span></button>
              <button className={actionClass} onClick={() => { setMode('key'); void startCamera(); }} type="button"><ActionIcon>⌁</ActionIcon><span className="font-bold">Escanear chave</span></button>
              <button className={actionClass} onClick={() => { setMode('attachment'); attachmentRef.current?.click(); }} type="button"><ActionIcon>▣</ActionIcon><span className="font-bold">Fotografar nota</span></button>
              <button className={actionClass} onClick={() => setMode('key')} type="button"><ActionIcon>123</ActionIcon><span className="font-bold">Digitar chave</span></button>
            </div>
            <input ref={xmlRef} className="hidden" type="file" accept=".xml,text/xml,application/xml" onChange={(e) => void importXml(e.target.files?.[0])} />
            <input ref={attachmentRef} className="hidden" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" capture={mode === 'attachment' ? 'environment' : undefined} onChange={(e) => selectAttachment(e.target.files?.[0])} />

            {(mode === 'key' || digits) && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4"><div className="flex items-center justify-between"><label className="font-bold" htmlFor="access-key">Chave de acesso</label><span className={`text-xs font-bold ${keyComplete && !keyValid ? 'text-rose-700' : 'text-slate-600'}`}>{digits.length}/44 dígitos</span></div><input id="access-key" inputMode="numeric" className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-mono tracking-wider outline-none" placeholder="0000 0000 0000 0000..." value={formattedKey} onChange={(e) => applyKey(e.target.value)} /><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className={`text-xs font-bold ${keyValid ? 'text-emerald-700' : keyComplete ? 'text-rose-700' : 'text-blue-700'}`}>{keyState}</span><button className="text-xs font-bold text-blue-700" onClick={() => void startCamera()} type="button">Ler pela câmera</button></div>{cameraError && <p className="mt-2 text-xs text-amber-800">{cameraError}</p>}</div>}

            <details className="mt-5 rounded-2xl border border-slate-200 p-4" open={mode === 'manual'} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setMode('manual'); }}><summary className="cursor-pointer font-bold">Preenchimento manual</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Número da nota" value={manualNumber} onChange={setManualNumber} /><Field label="Fornecedor" value={manualSupplier} onChange={setManualSupplier} /><Field label="Data/hora" value={manualDate} onChange={setManualDate} type="datetime-local" /><Field label="Responsável" value={responsible} onChange={setResponsible} /></div><label className="mt-4 block text-sm font-semibold">Observação<textarea className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 font-normal" value={notes} onChange={(e) => setNotes(e.target.value)} /></label><p className="mt-2 text-xs text-slate-500">Sem XML, a Conferência será iniciada sem itens para inclusão manual posterior.</p></details>

            {attachment && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 p-3">{attachment.file.type.startsWith('image/') ? <img alt="Miniatura da nota" className="h-16 w-16 rounded-lg object-cover" src={attachment.url} /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-rose-50 text-sm font-black text-rose-700">PDF</span>}<div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{attachment.file.name}</p><p className="text-xs text-slate-500">Anexo local • sem OCR</p></div><button className="text-xs font-bold text-rose-700" onClick={() => { URL.revokeObjectURL(attachment.url); setAttachment(null); if (attachmentRef.current) attachmentRef.current.value=''; }} type="button">Remover</button></div>}
            {message && <p role="status" className={`mt-4 rounded-xl p-3 text-sm font-semibold ${message.tone === 'error' ? 'bg-rose-50 text-rose-800' : message.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-blue-50 text-blue-800'}`}>{message.text}</p>}
          </section>

          <aside className="self-start rounded-3xl bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Documento em análise</h2><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /></div><dl className="mt-5 divide-y divide-slate-100"><ReviewRow label="Tipo" value={document.type} /><ReviewRow label="Fornecedor" value={effectiveSupplier} /><ReviewRow label="Número" value={effectiveNumber} /><ReviewRow label="Emissão" value={effectiveDate} /><ReviewRow label="Itens" value={document.items.length ? String(document.items.length) : ''} /><ReviewRow label="Valor" value={document.value === null ? '' : document.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} /></dl>{document.accessKey && <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">CHAVE</p><p className="mt-1 break-all font-mono text-xs leading-5">{formatKey(document.accessKey)}</p><p className="mt-2 text-xs text-slate-600">UF {document.uf || '—'} • Modelo {document.model || '—'} • Série {document.series || '—'} • CNPJ {document.cnpj || '—'}</p></div>}<div className="mt-6 grid gap-2"><button className="rounded-xl bg-blue-700 px-5 py-3.5 font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500" disabled={!hasDocumentMinimum} onClick={beginConference} type="button">Iniciar conferência</button><button className="rounded-xl px-5 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50" onClick={cancelReceiving} type="button">Cancelar recebimento</button></div></aside>
        </div>
      </main>
      {cameraOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-4"><video ref={videoRef} className="aspect-video w-full rounded-xl bg-black object-cover" playsInline muted /><p className="mt-3 text-sm text-slate-600">Aponte para o código de barras ou QR Code da nota.</p><button className="mt-3 w-full rounded-xl border px-4 py-3 font-bold" onClick={stopCamera} type="button">Fechar câmera</button></div></div>}
    </div>
  );
}

function ActionIcon({ children }: { children: React.ReactNode }) { return <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-blue-50 px-2 text-sm font-black text-blue-700 group-hover:bg-blue-700 group-hover:text-white">{children}</span>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v:string)=>void; type?: string }) { return <label className="text-sm font-semibold">{label}<input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" type={type} value={value} onChange={(e)=>onChange(e.target.value)} /></label>; }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-slate-500">{label}</dt><dd className={`max-w-[65%] text-right text-sm font-bold ${value ? 'text-slate-900' : 'text-slate-300'}`}>{value || '—'}</dd></div>; }

function validateAccessKey(key: string) { if (!/^\d{44}$/.test(key)) return false; let sum=0, weight=2; for(let i=42;i>=0;i--){ sum += Number(key[i])*weight; weight = weight===9?2:weight+1; } const remainder=sum%11; const digit=remainder<2?0:11-remainder; return digit===Number(key[43]); }
function formatKey(key:string){ return key.match(/.{1,4}/g)?.join(' ') ?? key; }
function identifyAccessKey(key:string): Partial<DocumentData> { const models:Record<string,"NF-e"|"CT-e">={"55":"NF-e","57":"CT-e"}; const ufs:Record<string,string>={"11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO","21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL","28":"SE","29":"BA","31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR","42":"SC","43":"RS","50":"MS","51":"MT","52":"GO","53":"DF"}; const model=key.slice(20,22); return { type:models[model]??"", uf:ufs[key.slice(0,2)]??key.slice(0,2), model, cnpj:key.slice(6,20).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'), series:String(Number(key.slice(22,25))), number:String(Number(key.slice(25,34))), issue:`${key.slice(4,6)}/20${key.slice(2,4)}` }; }
function localElements(root: Document|Element, name:string){ return Array.from(root.getElementsByTagName('*')).filter(el=>el.localName===name); }
function text(root:Element|undefined,name:string){ return root ? localElements(root,name)[0]?.textContent?.trim() ?? '' : ''; }
function parseFiscalXml(xml:string):DocumentData { const doc=new DOMParser().parseFromString(xml,'application/xml'); if(doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido ou corrompido.'); const nfe=localElements(doc,'infNFe')[0]; const cte=localElements(doc,'infCte')[0]; const root=nfe??cte; if(!root) throw new Error('XML incompatível: envie uma NF-e ou CT-e autorizada.'); const isNfe=Boolean(nfe); const ide=localElements(root,'ide')[0]; const emit=localElements(root,'emit')[0]; const rawId=root.getAttribute('Id')??root.getAttribute('id')??''; const accessKey=rawId.match(/\d{44}/)?.[0]??text(root,isNfe?'chNFe':'chCTe'); const number=text(ide,isNfe?'nNF':'nCT'); const series=text(ide,'serie'); const issue=text(ide,'dhEmi')||text(ide,'dEmi'); const totalRoot=localElements(root,isNfe?'ICMSTot':'vPrest')[0]; const rawValue=text(totalRoot,isNfe?'vNF':'vTPrest').replace(',','.'); const items:ReceivingItem[]=isNfe?localElements(root,'det').map(det=>{ const prod=localElements(det,'prod')[0]; const q=Number(text(prod,'qCom').replace(',','.')); const rastro=localElements(prod,'rastro')[0]; const ean=text(prod,'cEAN'); return {code:text(prod,'cProd'),barcode:ean.toUpperCase()==='SEM GTIN'?'':ean,product:text(prod,'xProd'),unit:text(prod,'uCom')||'UN',expected:Number.isFinite(q)?q:0,batch:text(rastro,'nLote'),validity:text(rastro,'dVal').slice(0,10)}; }).filter(i=>i.product):[]; const fromKey=accessKey.length===44?identifyAccessKey(accessKey):{}; return {type:isNfe?'NF-e':'CT-e',accessKey,number,series,issue,supplier:text(emit,'xNome'),cnpj:text(emit,'CNPJ'),uf:fromKey.uf??'',model:fromKey.model??(isNfe?'55':'57'),value:Number.isFinite(Number(rawValue))?Number(rawValue):null,items}; }
function toDateTimeLocal(value:string){ const date=new Date(value); if(Number.isNaN(date.getTime())) return value; const offset=date.getTimezoneOffset()*60000; return new Date(date.getTime()-offset).toISOString().slice(0,16); }
function hashText(value:string){ let hash=2166136261; for(let i=0;i<value.length;i++){ hash^=value.charCodeAt(i); hash=Math.imul(hash,16777619); } return (hash>>>0).toString(16); }
type Seen={key:string;xml:string;number:string;supplier:string;date:string}; const seenKey='stockscan-pro:recebimentos-sessao';
function readSeen():Seen[]{ try{return JSON.parse(sessionStorage.getItem(seenKey)??'[]') as Seen[];}catch{return[];} }
function findDuplicate(key:string,xml:string,number:string,supplier:string,date:string){ const when=new Date(date).getTime(); return readSeen().find(item=>Boolean(key&&item.key===key)||Boolean(xml&&item.xml===xml)||Boolean(number&&supplier&&item.number===number&&item.supplier.toLowerCase()===supplier.toLowerCase()&&Math.abs(new Date(item.date).getTime()-when)<=86400000)); }
function rememberDocument(key:string,xml:string,number:string,supplier:string,date:string){ try{ const next=[...readSeen(),{key,xml,number,supplier,date}].slice(-30); sessionStorage.setItem(seenKey,JSON.stringify(next)); }catch{/* sessão indisponível */} }
