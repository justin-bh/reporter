/**
 * Attestation letter generation. A short, formal letter — issued by the
 * assessing organization and gated on a generated report — that a client can
 * hand to auditors, customers, or regulators in support of a compliance
 * framework (SOC 2, HIPAA, PCI DSS, ISO 27001, NIST CSF, GDPR, or a custom
 * program). It attests to a specific `GeneratedReport` so its stated results
 * stay consistent with that deliverable even after the engagement's findings
 * change. Content follows the standard vendor-attestation flow; styling reuses
 * the report's tokens (see `letterCss`) so it reads as a first-class reporter
 * document. It is deliberately careful not to overreach — it attests to testing
 * activity, never certifies compliance.
 */
import type { FastifyInstance } from 'fastify';
import type { GeneratedReport as GeneratedReportRow } from '@prisma/client';
import {
  ATTESTATION_FRAMEWORK_LABELS,
  SEVERITY_LABELS,
  reportSummarySchema,
  type AttestationFramework,
  type Contact,
  type ReportSummary,
  type ScopeTarget,
  type Severity,
} from '@reporter/shared';
import { getReportSettings } from './report-settings.js';
import { longDate } from './findings-report.js';
import {
  FONT_LINKS,
  WATERMARK_OPACITY_VALUES,
  esc,
  letterCss,
  prose,
  watermarkCss,
  watermarkFontSize,
  watermarkMarkup,
} from './report-style.js';

/** The per-letter inputs chosen at download time (all optional; see route). */
export interface AttestationLetterInputs {
  framework: AttestationFramework;
  /** Names the framework when `framework` is `custom`. */
  frameworkLabel?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  signatoryEmail?: string;
  recipientName?: string;
  recipientTitle?: string;
  /** Overrides the snapshot's overall-risk rating in the results statement. */
  overallRisk?: Severity;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/** Spell small counts ("six (6)"); fall back to digits for larger numbers. */
function numberWord(n: number): string {
  return n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n]! : String(n);
}

/** Join a list as prose: "A", "A and B", "A, B, and C". */
function listJoin(items: string[]): string {
  const xs = items.filter((s) => s.trim());
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0]!;
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`;
}

/** The framework's display name, or the custom label. Null when unresolved. */
function frameworkDisplay(framework: AttestationFramework, customLabel?: string): string | null {
  if (framework === 'custom') return customLabel?.trim() || null;
  return ATTESTATION_FRAMEWORK_LABELS[framework];
}

/**
 * The framework-specific "Use of this letter" fine print. Each is a careful,
 * defensible statement: this is a vendor attestation of testing activity, not a
 * certification, and the sufficiency of the evidence for any given audit is the
 * client's (or its auditor's) determination.
 */
function frameworkFineprint(
  framework: AttestationFramework,
  ctx: { org: string; client: string; label: string | null },
): string {
  const { org, client, label } = ctx;
  switch (framework) {
    case 'soc2':
      return `This letter is a vendor attestation of penetration testing activity. It is not an examination or attestation report issued under AICPA attestation standards, and ${org} is not a licensed CPA firm. Penetration testing evidence of this nature is commonly referenced in support of the SOC 2 Trust Services Criteria relating to monitoring activities and the identification of vulnerabilities (for example, CC4.1 and CC7.1); the sufficiency of this evidence for any specific audit is determined by ${client}'s service auditor. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security.`;
    case 'hipaa':
      return `This letter is a vendor attestation of penetration testing activity and is not a HIPAA compliance certification. Testing of this nature is commonly referenced in support of the HIPAA Security Rule's evaluation standard (45 CFR § 164.308(a)(8)) and the technical safeguards at 45 CFR § 164.312; the sufficiency of this evidence for any specific compliance program is determined by ${client} and its advisors. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security or of the protection of electronic protected health information (ePHI).`;
    case 'pci_dss':
      return `This letter is a vendor attestation of penetration testing activity. It is not a Report on Compliance (ROC) or Attestation of Compliance (AOC), and ${org} is not acting as a PCI Qualified Security Assessor (QSA) in issuing this letter. Testing of this nature is commonly referenced in support of the PCI DSS penetration testing requirements (Requirement 11.4); the sufficiency of this evidence for any specific assessment is determined by ${client}'s QSA. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security.`;
    case 'iso_27001':
      return `This letter is a vendor attestation of penetration testing activity and is not an ISO/IEC 27001 certification, which may be issued only by an accredited certification body. Testing of this nature is commonly referenced in support of ISO/IEC 27001 controls for technical vulnerability management and security testing (for example, Annex A controls 8.8 and 8.29); the sufficiency of this evidence for any specific certification is determined by ${client}'s certification body. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security.`;
    case 'nist_csf':
      return `This letter is a vendor attestation of penetration testing activity and is not a formal NIST assessment or authorization. Testing of this nature is commonly referenced in support of the NIST Cybersecurity Framework, particularly the Identify (Risk Assessment, ID.RA) and Detect (DE.CM) functions; the sufficiency of this evidence for any specific program is determined by ${client}. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security.`;
    case 'gdpr':
      return `This letter is a vendor attestation of penetration testing activity and is not a determination of GDPR compliance. Testing of this nature is commonly referenced in support of the security-of-processing obligations in Article 32 of the EU General Data Protection Regulation, which calls for a process for regularly testing, assessing, and evaluating the effectiveness of technical and organizational measures; the sufficiency of this evidence for any specific obligation is determined by ${client} and its advisors. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security.`;
    case 'custom':
    default:
      return `This letter is a vendor attestation of penetration testing activity${
        label ? ` and is not a ${label} compliance certification` : ''
      }. Testing of this nature is commonly referenced in support of ${
        label ? `${label} compliance activities` : 'the client’s compliance activities'
      }; the sufficiency of this evidence for any specific requirement is determined by ${client} and its advisors. Findings reflect the state of the tested systems during the stated testing period and are not a guarantee of future security.`;
  }
}

/** A `<p>` of plain (escaped) text. */
function para(text: string): string {
  return `<p>${esc(text)}</p>`;
}

/** The severity-count table (report red-header style). `none` → "Informational". */
function resultsTable(bySeverity: ReportSummary['bySeverity'], total: number): string {
  return `<table class="tbl"><thead><tr>
    <th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Informational</th><th>Total</th>
  </tr></thead><tbody><tr>
    <td>${bySeverity.critical}</td><td>${bySeverity.high}</td><td>${bySeverity.medium}</td>
    <td>${bySeverity.low}</td><td>${bySeverity.none}</td><td>${total}</td>
  </tr></tbody></table>`;
}

/**
 * Build the attestation letter HTML for one generated report. `generatedAt` is
 * the letter's own date (typically "now").
 */
export async function buildAttestationLetterHtml(
  app: FastifyInstance,
  report: GeneratedReportRow,
  generatedAt: Date,
  inputs: AttestationLetterInputs,
): Promise<string> {
  const [settings, engagement] = await Promise.all([
    getReportSettings(app),
    app.db.engagement.findUniqueOrThrow({ where: { id: report.engagementId } }),
  ]);

  const orgName = settings.organizationName || 'Block Harbor';
  const accent = settings.accentColor || '#e82434';
  const clientName = engagement.clientName?.trim() || 'the client';
  const hasClientName = Boolean(engagement.clientName?.trim());
  const assessmentNoun = engagement.assessmentType?.trim() || 'penetration assessment';

  const summary: ReportSummary = reportSummarySchema.parse(report.summary);
  const reportRef = `${engagement.name}, Report ${report.version}, dated ${longDate(report.createdAt)}`;

  // Structured content (JSON columns → typed arrays).
  const scopeTargets = (engagement.scopeTargets as unknown as ScopeTarget[]) ?? [];
  const scopeExclusions = (engagement.scopeExclusions as unknown as string[]) ?? [];
  const providerContacts = (engagement.providerContacts as unknown as Contact[]) ?? [];
  const clientContacts = (engagement.clientContacts as unknown as Contact[]) ?? [];

  const targetNames = scopeTargets.map((t) => t.name.trim()).filter(Boolean);
  const scopeSubjects = targetNames.length ? listJoin(targetNames) : engagement.name;

  const windowStart = engagement.startedAt;
  const windowEnd = engagement.actualEndAt ?? engagement.projectedEndAt;

  const frameworkLabel = frameworkDisplay(inputs.framework, inputs.frameworkLabel);

  // Signatory: an explicit override, else the first provider contact, else the org.
  const sig = inputs.signatoryName?.trim()
    ? {
        name: inputs.signatoryName.trim(),
        title: inputs.signatoryTitle?.trim() ?? '',
        email: inputs.signatoryEmail?.trim() ?? '',
      }
    : providerContacts[0] && providerContacts[0].name.trim()
      ? {
          name: providerContacts[0].name.trim(),
          title: providerContacts[0].title.trim(),
          email: providerContacts[0].email.trim(),
        }
      : { name: orgName, title: '', email: '' };

  // Recipient (Attn): an explicit override, else the first client contact.
  const recipient = inputs.recipientName?.trim()
    ? { name: inputs.recipientName.trim(), title: inputs.recipientTitle?.trim() ?? '' }
    : clientContacts[0] && clientContacts[0].name.trim()
      ? { name: clientContacts[0].name.trim(), title: clientContacts[0].title.trim() }
      : null;

  const overallRisk = inputs.overallRisk ?? summary.overallRisk;

  // ---- Letterhead + title ------------------------------------------------
  const logo = settings.logoDataUri
    ? `<img class="lh-logo" src="${esc(settings.logoDataUri)}" alt="${esc(orgName)}" />`
    : `<div class="lh-wordmark">${esc(orgName)}<span class="dot">.</span></div>`;
  const letterhead = `<div class="letterhead">
    <div class="lh-brand">${logo}</div>
    ${hasClientName ? `<div class="lh-client">${esc(clientName)}</div>` : ''}
  </div>`;

  // ---- Addressee ---------------------------------------------------------
  const attn = recipient
    ? `<br/>Attn: ${esc(recipient.name)}${recipient.title ? `, ${esc(recipient.title)}` : ''}`
    : '';
  const addressBlock = `<div class="addr">${esc(hasClientName ? clientName : engagement.name)}${attn}</div>`;
  // Raw string — escaped exactly once at the render site (`esc(salutation)`),
  // like `opening`. Escaping here too would double-escape special characters.
  const salutation = recipient ? `Dear ${recipient.name},` : 'Dear Sir or Madam,';

  // ---- Opening -----------------------------------------------------------
  const opening =
    `${orgName} was engaged by ${clientName} to perform an independent, third-party ${assessmentNoun} of ${scopeSubjects}. ` +
    `This letter attests that the assessment was performed by ${orgName} and confirms that the final deliverable — ${reportRef} — reflects the findings verified by ${orgName}'s testing team.`;

  // ---- Engagement summary (key/value) ------------------------------------
  const kvRows: Array<[string, string]> = [
    ['Assessment provider', orgName],
    ...(hasClientName ? ([['Client', clientName]] as Array<[string, string]>) : []),
    ['Engagement', engagement.name],
    ['Testing period', `${longDate(windowStart)} – ${longDate(windowEnd)}`],
    ['Report issued', longDate(report.createdAt)],
    ['Report version', report.version],
  ];
  const summaryTable = `<table class="kv"><tbody>${kvRows
    .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(v)}</td></tr>`)
    .join('')}</tbody></table>`;

  // ---- Scope -------------------------------------------------------------
  let scopeSection = '';
  if (targetNames.length) {
    const bullets = scopeTargets
      .filter((t) => t.name.trim())
      .map((t) => {
        const subs = (t.subsystems ?? []).map((s) => s.trim()).filter(Boolean);
        const detail = subs.length ? ` ${esc(subs.join(', '))}.` : '';
        return `<li><strong>${esc(t.name.trim())}.</strong>${detail}</li>`;
      });
    const exclusions = scopeExclusions.map((s) => s.trim()).filter(Boolean);
    if (exclusions.length) {
      bullets.push(`<li><strong>Exclusions.</strong> ${esc(exclusions.join('; '))}.</li>`);
    }
    scopeSection = `<h2>Scope of Assessment</h2><ul class="scope">${bullets.join('')}</ul>`;
  } else if (engagement.scope?.trim()) {
    scopeSection = `<h2>Scope of Assessment</h2>${prose(engagement.scope)}`;
  }

  // ---- Methodology -------------------------------------------------------
  const methodologyBody = engagement.methodology?.trim()
    ? prose(engagement.methodology)
    : para(
        `${orgName} performed a structured ${assessmentNoun} combining manual testing with tool-assisted analysis against the systems described above. Testing focused on identifying exploitable weaknesses and validating the effectiveness of the in-scope security controls.`,
      );
  const methodologySection = `<h2>Methodology</h2>${methodologyBody}`;

  // ---- Summary of results ------------------------------------------------
  const n = summary.weaknessesTotal;
  let resultsSection: string;
  if (n === 0) {
    resultsSection = `<h2>Summary of Results</h2>${para(
      `${orgName} identified no weaknesses within the assessed scope during the testing period.`,
    )}`;
  } else {
    const intro = `${orgName} identified ${numberWord(n)} (${n}) ${
      n === 1 ? 'weakness' : 'weaknesses'
    } across the assessed scope, distributed as follows:`;
    const noHighCrit =
      summary.bySeverity.critical === 0 && summary.bySeverity.high === 0
        ? 'No Critical or High severity weaknesses were identified. '
        : '';
    const highest = summary.highestSeverity
      ? `The highest-rated weakness carried a severity of ${
          summary.highestCvss != null ? `${summary.highestCvss.toFixed(1)} (${SEVERITY_LABELS[summary.highestSeverity]})` : SEVERITY_LABELS[summary.highestSeverity]
        }. `
      : '';
    const overall = overallRisk
      ? `${orgName} assessed the overall risk of the assessed scope as ${SEVERITY_LABELS[overallRisk]}. `
      : '';
    const remediation = `All identified weaknesses, together with corresponding remediation recommendations, were reported to ${clientName} in ${reportRef}. Remediation is the responsibility of ${clientName}, and ${orgName} makes no representation in this letter as to the current remediation status of the findings described above.`;
    resultsSection = `<h2>Summary of Results</h2>${para(intro)}${resultsTable(
      summary.bySeverity,
      n,
    )}${para(`${noHighCrit}${highest}${overall}`.trim())}${para(remediation)}`;
  }

  // ---- Attestation -------------------------------------------------------
  const attestation = `<h2>Attestation</h2>${para(`${orgName} attests that:`)}<ol>
    <li>The ${esc(assessmentNoun)} described above was performed by ${esc(orgName)} personnel between ${esc(longDate(windowStart))} and ${esc(longDate(windowEnd))}, under authorization from ${esc(clientName)} and within the scope defined above.</li>
    <li>${esc(orgName)} acted as an independent third-party assessor and had no role in the design, development, or operation of the systems tested.</li>
    <li>${esc(reportRef)} is the authoritative deliverable for this engagement and accurately reflects the findings verified by ${esc(orgName)}'s testing team.</li>
    <li>The severity ratings and overall risk conclusion summarized in this letter are consistent with those recorded in that report.</li>
  </ol>`;

  // ---- Use of this letter ------------------------------------------------
  const usePara =
    `This letter is provided at the request of ${clientName} to support third-party security due diligence${
      frameworkLabel ? ` and ${frameworkLabel} compliance activities` : ''
    }. ${clientName} is authorized to share this letter with its customers, prospective customers, auditors, and regulators. ` +
    `It is issued as a summary attestation in lieu of distributing the full ${assessmentNoun} report, which remains confidential.`;
  const fineprint = frameworkFineprint(inputs.framework, {
    org: orgName,
    client: clientName,
    label: frameworkLabel,
  });
  const useSection = `<h2>Use of This Letter</h2>${para(usePara)}<p class="fineprint">${esc(
    fineprint,
  )}</p>${para('Please direct any questions regarding this attestation to the undersigned.')}`;

  // ---- Signature ---------------------------------------------------------
  const signature = `<div class="sig">
    <p class="close">Sincerely,</p>
    <div class="line"></div>
    <div class="nm">${esc(sig.name)}</div>
    ${sig.title ? `<div class="rl">${esc(sig.title)}</div>` : ''}
    <div class="rl">${esc(orgName)}</div>
    ${sig.email ? `<div class="rl">${esc(sig.email)}</div>` : ''}
    <p class="date">Date: ______________________</p>
  </div>`;

  // ---- Watermark (matches the report) ------------------------------------
  const wmText = engagement.watermarkText?.trim() || 'CONFIDENTIAL';
  const wmColor = engagement.watermarkColor || '#64748b';
  const wmOpacity =
    WATERMARK_OPACITY_VALUES[engagement.watermarkOpacity as keyof typeof WATERMARK_OPACITY_VALUES] ??
    WATERMARK_OPACITY_VALUES.medium;
  const wmLayer = engagement.watermarkLayer === 'front' ? 'front' : 'behind';
  const watermarkStyle = engagement.watermarkEnabled
    ? watermarkCss(wmColor, wmOpacity, wmLayer, watermarkFontSize(wmText))
    : '';
  const watermark = engagement.watermarkEnabled ? watermarkMarkup(wmText) : '';

  const hdrLeft = orgName.toUpperCase();
  const hdrRight = `${(hasClientName ? clientName : engagement.name).toUpperCase()} — ATTESTATION LETTER`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(hasClientName ? clientName : engagement.name)} — Attestation Letter</title>
${FONT_LINKS}
<style>${letterCss(accent, hdrLeft, hdrRight)}${watermarkStyle}</style>
</head>
<body>
  ${watermark}
  ${letterhead}
  <h1 class="letter-title">Attestation of Independent ${esc(assessmentNoun)}</h1>
  <hr class="letter-rule" />
  <div class="letter">
    <p class="date">${esc(longDate(generatedAt))}</p>
    ${addressBlock}
    <p class="re">RE: ${esc(`${engagement.name} — Report ${report.version}, dated ${longDate(report.createdAt)}`)}</p>
    <p>${esc(salutation)}</p>
    ${para(opening)}
    <h2>Engagement Summary</h2>
    ${summaryTable}
    ${scopeSection}
    ${methodologySection}
    ${resultsSection}
    ${attestation}
    ${useSection}
    ${signature}
  </div>
</body></html>`;
}
