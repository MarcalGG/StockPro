import AccountingDocumentsWorkspace from "../components/AccountingDocumentsWorkspace";
import AuthGate from "../components/AuthGate";

export default function DocumentosPage() {
  return (
    <AuthGate>
      <AccountingDocumentsWorkspace />
    </AuthGate>
  );
}
