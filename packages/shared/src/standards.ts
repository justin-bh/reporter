/**
 * Reference catalogs for mapping findings to automotive-cybersecurity standards:
 * ISO/SAE 21434:2021 work products (including TARA) and UN Regulation No. 155
 * requirements. A finding stores arrays of these entries' `id`s; the finding
 * editor's pickers and the report resolve ids → entries via the lookups below
 * (an unknown id falls back to showing the raw id, so stored mappings never break
 * if the catalog changes).
 */

export interface StandardRef {
  /** Stable identifier stored on findings. */
  id: string;
  /** Concise human-readable name. */
  label: string;
  /** Clause / section / paragraph number as written in the standard. */
  clause: string;
  /** Grouping heading, used to section the picker. */
  group: string;
}

/** ISO/SAE 21434:2021 work products / clauses a finding can reference (incl. TARA). */
export const ISO_21434_WORK_PRODUCTS: readonly StandardRef[] = [
  { id: 'iso-06-mgmt', label: 'Cybersecurity management — organizational rules and processes', clause: '6', group: 'Clause 6 — Organizational cybersecurity management' },
  { id: 'iso-06-culture', label: 'Cybersecurity governance, competence and awareness management', clause: '6.4', group: 'Clause 6 — Organizational cybersecurity management' },
  { id: 'iso-08-monitoring', label: '[WP-08-01] Cybersecurity monitoring — sources for information gathering', clause: '8.3', group: 'Clause 8 — Continual cybersecurity activities' },
  { id: 'iso-08-triggers', label: '[WP-08-02] Triggers for cybersecurity event assessment', clause: '8.3', group: 'Clause 8 — Continual cybersecurity activities' },
  { id: 'iso-08-event', label: '[WP-08-03] Cybersecurity event assessment result', clause: '8.4', group: 'Clause 8 — Continual cybersecurity activities' },
  { id: 'iso-08-vuln-analysis', label: '[WP-08-04] Vulnerability analysis — identification and analysis of vulnerabilities', clause: '8.5', group: 'Clause 8 — Continual cybersecurity activities' },
  { id: 'iso-08-vuln-mgmt', label: '[WP-08-05] Vulnerability management — evidence of managed vulnerabilities', clause: '8.6', group: 'Clause 8 — Continual cybersecurity activities' },
  { id: 'iso-09-item-def', label: '[WP-09-01] Item definition', clause: '9.3', group: 'Clause 9 — Concept phase' },
  { id: 'iso-09-cs-goals', label: '[WP-09-02] Cybersecurity goals', clause: '9.4', group: 'Clause 9 — Concept phase' },
  { id: 'iso-09-cal', label: '[WP-09-03] Cybersecurity assurance level (CAL) assignment', clause: '9.4', group: 'Clause 9 — Concept phase' },
  { id: 'iso-09-cs-claims', label: '[WP-09-04] Cybersecurity claims (with associated assumptions)', clause: '9.4', group: 'Clause 9 — Concept phase' },
  { id: 'iso-09-cs-concept', label: '[WP-09-05] Cybersecurity concept — requirements and controls to achieve goals', clause: '9.5', group: 'Clause 9 — Concept phase' },
  { id: 'iso-10-req-arch', label: '[WP-10-01] Cybersecurity specifications (requirements and architectural design)', clause: '10.4.1', group: 'Clause 10 — Product development' },
  { id: 'iso-10-weakness', label: '[WP-10-02] Weakness and vulnerability analysis from design/implementation', clause: '10.4.2', group: 'Clause 10 — Product development' },
  { id: 'iso-10-integration-test', label: '[WP-10-03] Integration and verification specification / report', clause: '10.4.3', group: 'Clause 10 — Product development' },
  { id: 'iso-11-validation', label: '[WP-11-01] Validation report — cybersecurity goals adequacy and achievement', clause: '11.4', group: 'Clause 11 — Cybersecurity validation' },
  { id: 'iso-15-tara', label: 'TARA — Threat Analysis and Risk Assessment methods', clause: '15', group: 'Clause 15 — TARA' },
  { id: 'iso-15-01', label: '[WP-15-01] Asset identification — assets with cybersecurity properties', clause: '15.3', group: 'Clause 15 — TARA' },
  { id: 'iso-15-02', label: '[WP-15-02] Threat scenario identification', clause: '15.4', group: 'Clause 15 — TARA' },
  { id: 'iso-15-03', label: '[WP-15-03] Impact rating — damage scenarios with SFOP impact ratings', clause: '15.5', group: 'Clause 15 — TARA' },
  { id: 'iso-15-04', label: '[WP-15-04] Attack path analysis', clause: '15.6', group: 'Clause 15 — TARA' },
  { id: 'iso-15-05', label: '[WP-15-05] Attack feasibility rating', clause: '15.7', group: 'Clause 15 — TARA' },
  { id: 'iso-15-06', label: '[WP-15-06] Risk value determination', clause: '15.8', group: 'Clause 15 — TARA' },
  { id: 'iso-15-07', label: '[WP-15-07] Risk treatment decision', clause: '15.9', group: 'Clause 15 — TARA' },
];

/** UN Regulation No. 155 requirements / Annex 5 entries a finding can reference. */
export const UN_R155_REQUIREMENTS: readonly StandardRef[] = [
  { id: 'unr155-7.2.2.2', label: 'CSMS — processes to identify, assess, categorize and treat cyber risks', clause: '7.2.2.2', group: 'CSMS requirements (7.2)' },
  { id: 'unr155-7.2.2.2-c', label: 'CSMS — processes to verify risks are appropriately managed', clause: '7.2.2.2 (c)', group: 'CSMS requirements (7.2)' },
  { id: 'unr155-7.2.2.2-d', label: 'CSMS — processes for testing cybersecurity of the vehicle type', clause: '7.2.2.2 (d)', group: 'CSMS requirements (7.2)' },
  { id: 'unr155-7.2.2.2-e', label: 'CSMS — keeping risk assessment current', clause: '7.2.2.2 (e)', group: 'CSMS requirements (7.2)' },
  { id: 'unr155-7.2.2.2-g', label: 'CSMS — monitor, detect and respond to attacks/threats/vulnerabilities', clause: '7.2.2.2 (g)', group: 'CSMS requirements (7.2)' },
  { id: 'unr155-7.2.2.5', label: 'CSMS — manage dependencies with suppliers/service providers', clause: '7.2.2.5', group: 'CSMS requirements (7.2)' },
  { id: 'unr155-7.3.1', label: 'Documented risk assessment analysis for the vehicle type', clause: '7.3.1', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.2', label: 'Identify and manage risks / critical elements of the vehicle type', clause: '7.3.2', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.3', label: 'Risk assessment shall consider Annex 5 Part A threats and other relevant threats', clause: '7.3.3', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.4', label: 'Protect the vehicle type against assessed risks with proportionate mitigations', clause: '7.3.4', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.5', label: 'Implement measures to detect and prevent cyberattacks against vehicles', clause: '7.3.5', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.6', label: 'Support monitoring capability — detect threats/vulnerabilities/attacks, data forensics', clause: '7.3.6', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.7', label: 'Appropriate and proportionate mitigations for external interfaces and OTA/update processes', clause: '7.3.7', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-7.3.8', label: 'Provide reporting/data to verify effectiveness of implemented mitigations', clause: '7.3.8', group: 'Vehicle type requirements (7.3)' },
  { id: 'unr155-a5-a-4.3.1', label: 'Threat — Back-end servers used to attack a vehicle or extract data', clause: 'Annex 5, Part A, 4.3.1', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.2', label: 'Threat — Spoofing of messages or data to deceive the vehicle', clause: 'Annex 5, Part A, 4.3.2', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.3', label: 'Threat — Communication channels used to conduct unauthorized manipulation/tampering of vehicle code/data', clause: 'Annex 5, Part A, 4.3.3', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.4', label: 'Threat — Communication channels permit untrusted/unreliable messages or session hijacking/replay', clause: 'Annex 5, Part A, 4.3.4', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.5', label: 'Threat — Information can be readily disclosed (e.g. eavesdropping, unauthorized access to files)', clause: 'Annex 5, Part A, 4.3.5', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.6', label: 'Threat — Denial of service attacks disrupt vehicle functions', clause: 'Annex 5, Part A, 4.3.6', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.7', label: 'Threat — Privileged access rights gained by unprivileged users', clause: 'Annex 5, Part A, 4.3.7', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.8', label: 'Threat — Viruses/malware embedded in communication media', clause: 'Annex 5, Part A, 4.3.8', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.3.9', label: 'Threat — Messages/data received by the vehicle are malicious', clause: 'Annex 5, Part A, 4.3.9', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.4.1', label: 'Threat — Update procedures compromised / manipulation of update software', clause: 'Annex 5, Part A, 4.4.1', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.4.2', label: 'Threat — Denial of legitimate updates (withholding critical updates)', clause: 'Annex 5, Part A, 4.4.2', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.9.1', label: 'Threat — Physical/local manipulation of systems enabling an attack (e.g. OBD/USB)', clause: 'Annex 5, Part A, 4.9.1', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.10.1', label: 'Threat — Extraction of vehicle software/data or unauthorized modification/replacement', clause: 'Annex 5, Part A, 4.10.1', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-a-4.11.1', label: 'Threat — Loss of cryptographic keys / weak or misapplied cryptography', clause: 'Annex 5, Part A, 4.11.1', group: 'Annex 5 Part A — Threats' },
  { id: 'unr155-a5-b-m10', label: 'Mitigation — Authentication and integrity protection of messages (vehicle)', clause: 'Annex 5, Part B, M10', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m11', label: 'Mitigation — Access control and authorization techniques for privileged/system access', clause: 'Annex 5, Part B, M11', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m12', label: 'Mitigation — Security controls to protect back-end/system data and prevent unauthorized access', clause: 'Annex 5, Part B, M12', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m13', label: 'Mitigation — Measures to prevent and detect unauthorized access (e.g. IDS)', clause: 'Annex 5, Part B, M13', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m14', label: 'Mitigation — Confidentiality and integrity protection of stored/transmitted data (encryption)', clause: 'Annex 5, Part B, M14', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m20', label: 'Mitigation — Secure software update process and verification of authenticity/integrity', clause: 'Annex 5, Part B, M20', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m21', label: 'Mitigation — Protection of cryptographic keys against tampering/extraction', clause: 'Annex 5, Part B, M21', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m22', label: 'Mitigation — Measures to detect and recover from denial-of-service conditions', clause: 'Annex 5, Part B, M22', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-b-m23', label: 'Mitigation — Hardening measures against physical/local tampering and data extraction', clause: 'Annex 5, Part B, M23', group: 'Annex 5 Part B — Mitigations (vehicle)' },
  { id: 'unr155-a5-c-m1', label: 'Mitigation — Security controls applied to back-end systems', clause: 'Annex 5, Part C, M1', group: 'Annex 5 Part C — Mitigations (backend)' },
  { id: 'unr155-a5-c-m2', label: 'Mitigation — Access controls and privilege management on back-end systems', clause: 'Annex 5, Part C, M2', group: 'Annex 5 Part C — Mitigations (backend)' },
  { id: 'unr155-a5-c-m3', label: 'Mitigation — Protection against data breaches / unauthorized data access on back-end', clause: 'Annex 5, Part C, M3', group: 'Annex 5 Part C — Mitigations (backend)' },
];

const isoById = new Map(ISO_21434_WORK_PRODUCTS.map((r) => [r.id, r] as const));
const unrById = new Map(UN_R155_REQUIREMENTS.map((r) => [r.id, r] as const));

/** Resolve an ISO/SAE 21434 reference id to its catalog entry (undefined if unknown). */
export function iso21434Ref(id: string): StandardRef | undefined {
  return isoById.get(id);
}

/** Resolve a UN R155 reference id to its catalog entry (undefined if unknown). */
export function unr155Ref(id: string): StandardRef | undefined {
  return unrById.get(id);
}
