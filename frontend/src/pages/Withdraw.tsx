import { Banknote, CreditCard, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

/** Withdraw - agent / ATM / bank to M-PESA. The flow is not built yet; the
 * page stays honest about that instead of offering a disabled primary. */
export default function Withdraw() {
  const options = [
    {
      icon: Banknote,
      title: "Agent",
      desc: "Withdraw cash from an M-Pesa agent.",
    },
    {
      icon: CreditCard,
      title: "ATM",
      desc: "Withdraw cash from an ATM.",
    },
    {
      icon: Landmark,
      title: "Bank to M-Pesa",
      desc: "Move money from a bank to M-Pesa.",
    },
  ];
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <PageHeader title="Withdraw" />
      <Card>
        <CardContent className="space-y-2 pt-0">
          {options.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-3 border border-border p-3.5 opacity-70"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-[13px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
          <p className="pt-1 text-[13px] text-muted-foreground">
            Withdraw is being built. For now, use M-Pesa or your bank app; the
            ledger above still records the withdrawal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
