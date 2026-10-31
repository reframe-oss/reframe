"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Mail,
  Github,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Globe,
  Sparkles,
  ArrowLeft,
  Loader2,
} from "lucide-react";

interface FormData {
  name: string;
  email: string;
  subject: string;
  github: string;
  socials: string;
  message: string;
}

export default function ContactClient() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    subject: "feedback",
    github: "",
    socials: "",
    message: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required.";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (
      !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email.trim())
    ) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message is required.";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters long.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSuccess(false);

    if (!validate()) return;

    try {
      setLoading(true);

      // Simulate sending inquiry / client dispatch
      await new Promise((r) => setTimeout(r, 1000));

      setSuccess(true);
      setFormData({
        name: "",
        email: "",
        subject: "feedback",
        github: "",
        socials: "",
        message: "",
      });
    } catch {
      setErrors({
        submit: "Something went wrong while sending your message. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const contactCards = [
    {
      icon: Github,
      title: "GitHub Repository",
      description: "Contribute code, open pull requests, and report issues directly.",
      linkText: "reframe-oss/reframe",
      href: "https://github.com/reframe-oss/reframe",
      badge: "Open Source",
    },
    {
      icon: MessageSquare,
      title: "GitHub Discussions",
      description: "Join our community, request new features, or share suggestions.",
      linkText: "Join community discussions",
      href: "https://github.com/reframe-oss/reframe/discussions",
      badge: "Community",
    },
    {
      icon: Mail,
      title: "Direct Inquiries",
      description: "Reach maintainers regarding security, collaborations, or general questions.",
      linkText: "support@reframe-editor.com",
      href: "mailto:support@reframe-editor.com",
      badge: "Direct Contact",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-200">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface)]/60 to-[var(--bg)] py-14 sm:py-20 px-4 sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,var(--accent-muted),transparent)] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative">
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)] transition-colors py-1 px-2.5 rounded-[var(--radius)] hover:bg-[var(--surface)] w-fit"
            >
              <ArrowLeft size={14} />
              Back to Reframe
            </Link>
          </div>

          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--accent-muted)] text-[var(--accent)] mb-4">
              <Sparkles size={13} />
              We&apos;d love to hear from you
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-extrabold tracking-tight text-[var(--text)] mb-4">
              Get in Touch with Reframe
            </h1>
            <p className="text-base sm:text-lg text-[var(--muted)] leading-relaxed">
              Have a question, feedback, or need help with video processing? Reach out using the form below or connect directly through our open-source channels.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content: Info Cards & Form */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Contact Cards & Info */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <h2 className="text-xl font-heading font-bold text-[var(--text)] mb-2">
                Connect Directly
              </h2>
              <p className="text-sm text-[var(--muted)]">
                Pick the channel that works best for your inquiry or contribution.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {contactCards.map((card, idx) => {
                const IconComponent = card.icon;
                return (
                  <a
                    key={idx}
                    href={card.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex flex-col p-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/50 hover:bg-[var(--surface)] hover:border-[var(--accent)] hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-[var(--radius)] bg-[var(--accent-muted)] text-[var(--accent)] group-hover:scale-105 transition-transform">
                        <IconComponent size={20} />
                      </div>
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--muted)] px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--border)]">
                        {card.badge}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-[var(--text)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
                      {card.description}
                    </p>

                    <div className="mt-auto text-xs font-medium text-[var(--accent)] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      <span>{card.linkText}</span>
                      <span>→</span>
                    </div>
                  </a>
                );
              })}
            </div>

            {/* Availability & Location Callout */}
            <div className="p-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/30 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                <Globe size={14} className="text-[var(--accent)]" />
                Global &amp; Client-Side
              </div>
              <p className="text-xs text-[var(--muted)] leading-relaxed">
                Reframe is a fully client-side application built by an international open-source community. Your videos never leave your browser, ensuring complete privacy.
              </p>
              <div className="flex items-center gap-2 text-xs text-[var(--muted)] pt-1">
                <Clock size={13} className="text-[var(--accent)]" />
                <span>Response time: Usually within 24–48 hours</span>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-7">
            <div className="p-6 sm:p-8 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]/40 shadow-sm">
              <div className="mb-6">
                <h2 className="text-2xl font-heading font-bold text-[var(--text)] mb-2">
                  Send Us a Message
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  Fill in your details and we&apos;ll get back to you as soon as possible.
                </p>
              </div>

              {success && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-6 p-4 rounded-[var(--radius)] border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300 flex items-start gap-3"
                >
                  <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-500" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Message Sent Successfully!</h3>
                    <p className="text-xs opacity-90 leading-relaxed">
                      Thank you for reaching out. We have received your submission and will get back to you shortly.
                    </p>
                  </div>
                </div>
              )}

              {errors.submit && (
                <div
                  role="alert"
                  className="mb-6 p-4 rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 flex items-start gap-3"
                >
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-500" />
                  <div>
                    <h3 className="text-sm font-semibold mb-1">Error Sending Message</h3>
                    <p className="text-xs opacity-90 leading-relaxed">{errors.submit}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="contact-name"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                    >
                      Your Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="contact-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="e.g. Alex Taylor"
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "name-error" : undefined}
                      className={`w-full px-3.5 py-2.5 text-sm rounded-[var(--radius)] border bg-[var(--bg)] text-[var(--text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                        errors.name
                          ? "border-red-500 focus:border-red-500"
                          : "border-[var(--border)] hover:border-[var(--muted)]"
                      }`}
                    />
                    {errors.name && (
                      <p id="name-error" className="text-xs text-red-500 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} />
                        {errors.name}
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="contact-email"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                    >
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="contact-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="alex@example.com"
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? "email-error" : undefined}
                      className={`w-full px-3.5 py-2.5 text-sm rounded-[var(--radius)] border bg-[var(--bg)] text-[var(--text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                        errors.email
                          ? "border-red-500 focus:border-red-500"
                          : "border-[var(--border)] hover:border-[var(--muted)]"
                      }`}
                    />
                    {errors.email && (
                      <p id="email-error" className="text-xs text-red-500 flex items-center gap-1 mt-1">
                        <AlertCircle size={12} />
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Subject / Topic */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="contact-subject"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                    >
                      Topic
                    </label>
                    <select
                      id="contact-subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 text-sm rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] hover:border-[var(--muted)]"
                    >
                      <option value="feedback">General Feedback</option>
                      <option value="bug">Bug Report</option>
                      <option value="feature">Feature Request</option>
                      <option value="contribute">Open Source Contribution</option>
                      <option value="other">Other Inquiry</option>
                    </select>
                  </div>

                  {/* GitHub Username (Optional) */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="contact-github"
                      className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                    >
                      GitHub Username <span className="text-xs lowercase text-[var(--muted)] font-normal">(optional)</span>
                    </label>
                    <input
                      id="contact-github"
                      name="github"
                      type="text"
                      value={formData.github}
                      onChange={handleChange}
                      placeholder="@username"
                      className="w-full px-3.5 py-2.5 text-sm rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] hover:border-[var(--muted)]"
                    />
                  </div>
                </div>

                {/* Socials / Links (Optional) */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-socials"
                    className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                  >
                    Website or Social Handle <span className="text-xs lowercase text-[var(--muted)] font-normal">(optional)</span>
                  </label>
                  <input
                    id="contact-socials"
                    name="socials"
                    type="text"
                    value={formData.socials}
                    onChange={handleChange}
                    placeholder="https://twitter.com/username or your portfolio"
                    className="w-full px-3.5 py-2.5 text-sm rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] hover:border-[var(--muted)]"
                  />
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="contact-message"
                    className="block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]"
                  >
                    Your Message <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="Tell us what's on your mind, what feature you'd like to see, or any issue you encountered..."
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? "message-error" : undefined}
                    className={`w-full px-3.5 py-2.5 text-sm rounded-[var(--radius)] border bg-[var(--bg)] text-[var(--text)] transition-colors resize-y focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${
                      errors.message
                        ? "border-red-500 focus:border-red-500"
                        : "border-[var(--border)] hover:border-[var(--muted)]"
                    }`}
                  />
                  {errors.message && (
                    <p id="message-error" className="text-xs text-red-500 flex items-center gap-1 mt-1">
                      <AlertCircle size={12} />
                      {errors.message}
                    </p>
                  )}
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto min-w-[160px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[var(--radius)] font-medium text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Sending Message...
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Send Message
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
