import { notFound } from "next/navigation";
import type { Metadata } from "next";

const spaces: Record<string, { title: string; description: string }> = {
  adopt: { title: "Free pet adoption · PawBangla", description: "Browse approved, free pet rehoming posts. PawBangla does not allow buying or selling animals." },
  "find-care": { title: "Find clinics and pet shops · PawBangla", description: "Search veterinary clinics, pet shops and animal-care providers across Bangladesh with map links and listing status." },
  care: { title: "Pet care guides · PawBangla", description: "Read clear, reviewed pet-care information for animals and their caretakers." },
  help: { title: "Pet SOS alerts · PawBangla", description: "See immediate, unverified lost, found and injured pet reports. Reports do not guarantee a response or rescue." },
  "report-cat": { title: "Report a pet SOS · PawBangla", description: "Post an immediate lost, found or injured pet report for the community. Reports publish without pre-review." },
  community: { title: "Pet community · PawBangla", description: "View approved pet photos shared by the PawBangla community." },
  "share-photo": { title: "Share a pet photo · PawBangla", description: "Submit an optional pet photo for private review before it appears in the PawBangla community gallery." },
  about: { title: "About PawBangla", description: "Learn about the PawBangla animal-welfare project and its community-first goals." },
  "verify-adopter": { title: "Private identity check · PawBangla", description: "Request an in-person identity check to protect adoption contact information." },
};

export async function generateMetadata({ params }: { params: Promise<{ space: string }> }): Promise<Metadata> {
  const { space } = await params;
  const page = spaces[space];
  return page ? { title: page.title, description: page.description, openGraph: { title: page.title, description: page.description } } : {};
}

export default async function SpacePage({ params, searchParams }: { params: Promise<{ space: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { space } = await params;
  const page = spaces[space];
  if (!page) notFound();
  const query = await searchParams;
  const alertId = space === "help" && typeof query?.alert === "string" ? query.alert : "";
  const frameQuery = new URLSearchParams({ space, ...(alertId ? { alert: alertId } : {}) }).toString();
  return (
    <main className="h-[100dvh] w-full overflow-hidden bg-[#f8f7f1]">
      <iframe
        title={page.title}
        src={`/pawbangla.html?${frameQuery}`}
        className="route-frame block h-full w-full border-0"
      />
    </main>
  );
}
