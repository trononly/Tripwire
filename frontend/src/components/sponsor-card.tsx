import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { openExternalUrl } from "@/lib/external-url";
import { pickHouseAd, useHouseAds } from "@/lib/house-ads";
import { todayKey } from "@/lib/ads";

/**
 * Inline sponsor slot for the Insights grid. One card rotates daily; when
 * there is no sponsor (or the fetch failed with nothing cached) the slot is
 * simply absent, never a "your ad here" placeholder in the product.
 */
export function SponsorCard() {
  const ad = pickHouseAd(useHouseAds(), todayKey());
  if (!ad) return null;
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => openExternalUrl(ad.url)}
        >
          Visit
        </Button>
      </CardContent>
    </Card>
  );
}
