import type { Metadata } from "next";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact Us — Reframe",
  description: "Get in touch with the Reframe team. Send feedback, report issues, or contribute to our open-source video editor.",
};

export default function ContactPage() {
  return <ContactClient />;
}