import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your M-Pesa activity.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total In</CardDescription>
            <CardTitle className="text-2xl">KSh 0.00</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Out</CardDescription>
            <CardTitle className="text-2xl">KSh 0.00</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-2xl">0</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
