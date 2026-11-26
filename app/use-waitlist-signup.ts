"use client";

import { FormEvent, useState } from "react";

export type WaitlistSubmissionState = "idle" | "loading" | "success" | "error";

/**
 * Submit logic for the waitlist email form, shared by /waitlist and the /demo
 * footer so both talk to the same `/api/waitlist` endpoint with the same
 * validation and messages. Callers bring their own markup and styles.
 */
export function useWaitlistSignup() {
  const [submissionState, setSubmissionState] = useState<WaitlistSubmissionState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = event.currentTarget;
    const emailInput = form.elements.namedItem("email");

    if (!(emailInput instanceof HTMLInputElement) || !emailInput.checkValidity()) {
      setSubmissionState("error");
      setMessage("Enter a valid email address.");
      if (emailInput instanceof HTMLInputElement) emailInput.focus();
      return;
    }

    setSubmissionState("loading");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.value }),
      });
      const result = (await response.json()) as { ok?: boolean; message?: unknown };
      const responseMessage =
        typeof result.message === "string" ? result.message : "The waitlist is unavailable right now.";

      if (!response.ok || result.ok !== true) {
        setSubmissionState("error");
        setMessage(responseMessage);
        return;
      }

      form.reset();
      setSubmissionState("success");
      setMessage(responseMessage);
    } catch {
      setSubmissionState("error");
      setMessage("The waitlist is unavailable right now. Please try again.");
    }
  }

  return { submissionState, message, handleSubmit, isLoading: submissionState === "loading" };
}
