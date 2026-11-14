import { connection } from "next/server";
import { currentMonth } from "@/lib/journey";
import { getJourney } from "@/lib/journey-catalog";
import { Journey } from "./journey";

export async function JourneySection() {
  await connection();
  const entries = await getJourney();
  if (!entries?.length) return null;
  return <Journey entries={entries} now={currentMonth()} />;
}
