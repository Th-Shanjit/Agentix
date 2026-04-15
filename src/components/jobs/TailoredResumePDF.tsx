"use client";

import { forwardRef } from "react";

type TailoredResumePDFProps = {
  tone: string;
  resumeText: string;
  role: string;
  company: string;
};

/**
 * Hidden render target for client-side PDF generation.
 * Uses ATS-friendly typography and single-column layout.
 */
export const TailoredResumePDF = forwardRef<HTMLDivElement, TailoredResumePDFProps>(
  function TailoredResumePDF({ tone, resumeText, role, company }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: "794px", // close to A4 at ~96dpi
          minHeight: "1123px",
          background: "#ffffff",
          color: "#000000",
          padding: "48px",
          fontFamily: "Arial, 'Times New Roman', serif",
          lineHeight: 1.45,
          fontSize: "12pt",
          boxSizing: "border-box",
        }}
      >
        <header style={{ marginBottom: "20px", borderBottom: "1px solid #d1d5db" }}>
          <h1
            style={{
              fontSize: "18pt",
              fontWeight: 700,
              margin: 0,
              marginBottom: "6px",
            }}
          >
            Tailored ATS Resume
          </h1>
          <p style={{ margin: 0, marginBottom: "4px" }}>
            <strong>Target Role:</strong> {role}
          </p>
          <p style={{ margin: 0, marginBottom: "4px" }}>
            <strong>Company:</strong> {company}
          </p>
          <p style={{ margin: 0, marginBottom: "10px" }}>
            <strong>Tone:</strong> {tone}
          </p>
        </header>

        <main>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "Arial, 'Times New Roman', serif",
              fontSize: "12pt",
              lineHeight: 1.45,
            }}
          >
            {resumeText}
          </pre>
        </main>
      </div>
    );
  }
);
