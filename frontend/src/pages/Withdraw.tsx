import { Banknote, CreditCard, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Withdraw — TODO: agent / ATM / bank to M-PESA. Placeholder page. */
export default function Withdraw() {
  const options = [
    {
      icon: Banknote,
      title: "Agent",
      desc: "Withdraw cash from an M-PESA agent.",
    },
    {
      icon: CreditCard,
      title: "ATM",
      desc: "Withdraw cash from an ATM.",
    },
    {
      icon: Landmark,
      title: "Bank to M-PESA",
      desc: "Move money from a bank to M-PESA.",
    },
  ];
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          {options.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-md border p-3 opacity-60"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
          <Button className="w-full" size="lg" disabled>
            Coming soon
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
