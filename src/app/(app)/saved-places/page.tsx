import { redirect } from "next/navigation";

/** Saved Places now lives under Wishlist with collections and future-trip links. */
export default function SavedPlacesRedirectPage() {
  redirect("/wishlist");
}
