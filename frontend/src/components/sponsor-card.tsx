import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { openExternalUrl } from "@/lib/external-url";
import { ADVERTISE_URL, pickHouseAd, useHouseAds } from "@/lib/house-ads";
import { todayKey } from "@/lib/ads";

/**
 * Inline sponsor slot for the Insights tile grid. One card rotates daily;
 * with no sponsors (or offline and nothing cached) it becomes an
 * "Advertise here" fallback pointing at the repo issues page.
 */
export function SponsorCard() {
  const ad = pickHouseAd(useHouseAds(), todayKey());
  if (ad) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>Sponsored</CardDescription>
          <CardTitle>{ad.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {ad.text}
          </p>
          <Button size="sm" variant="outline" onClick={() => openExternalUrl(ad.url)}>
            Visit
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center gap-2">
        <Megaphone className="size-5 shrink-0 text-muted-foreground" />
        <CardTitle>This could be your ad</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {"Wanna reach more users? Sponsor the project and you'll get your spot right here"}
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openExternalUrl(ADVERTISE_URL)}
        >
          Advertise here
        </Button>
      </CardContent>
    </Card>
  );
}
