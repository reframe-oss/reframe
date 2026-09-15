"use client";

import Link from "next/link";
import { useState } from "react";

export default function ContactClient() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    github: "",
    socials: "",
    message: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = "Name is required.";

    if (!formData.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (
      !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(formData.email)
    ) {
      newErrors.email = "Invalid email address.";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message is required.";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message should be at least 10 characters.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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

    setSuccess("");

    if (!validate()) return;

    try {
      setLoading(true);

      await new Promise((r) => setTimeout(r, 1200));

      setSuccess("Your message has been sent successfully!");

      setFormData({
        name: "",
        email: "",
        github: "",
        socials: "",
        message: "",
      });
    } catch {
      setErrors({
        submit: "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10">
          <Link
            href="/"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)]"
          >
            ← Back to Reframe
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-4">Contact Us</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Name"
            className="w-full p-3 border rounded"
          />
          {errors.name && <p className="text-red-400">{errors.name}</p>}

          <input
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
            className="w-full p-3 border rounded"
          />
          {errors.email && <p className="text-red-400">{errors.email}</p>}

          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            placeholder="Message"
            className="w-full p-3 border rounded"
          />
          {errors.message && (
            <p className="text-red-400">{errors.message}</p>
          )}

          {errors.submit && (
            <p className="text-red-400">{errors.submit}</p>
          )}

          {success && (
            <p className="text-green-400">{success}</p>
          )}

          <button
            disabled={loading}
            className="w-full p-3 bg-[var(--accent)] text-white rounded"
          >
            {loading ? "Sending..." : "Send Message"}
          </button>
        </form>
      </div>
    </main>
  );
}