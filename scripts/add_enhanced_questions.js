// Script to add enhanced "BEST/MOST/FIRST" style questions to questions.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced questions with proper CompTIA ambiguity
const enhancedQuestions = [
  {
    "id": "SEC-ENHANCED-001",
    "domain": "Security Operations",
    "difficulty": "Hard",
    "question": "A company experiences a breach where an attacker gained access to the network through a compromised vendor account. The incident response team has contained the threat and is now in the recovery phase. Which action should be taken FIRST to prevent similar incidents?",
    "choices": {
      "A": "Implement multi-factor authentication for all vendor accounts",
      "B": "Conduct a comprehensive security audit of all third-party access",
      "C": "Review and update the incident response plan",
      "D": "Terminate all existing vendor accounts immediately"
    },
    "answer": "B",
    "explanation": "While all options have merit, a comprehensive security audit (B) should be done FIRST to understand the full scope of third-party access risks before implementing specific controls. MFA (A) is important but should be based on audit findings. Reviewing the IR plan (C) is premature until you understand what went wrong. Terminating accounts (D) would disrupt business operations unnecessarily."
  },
  {
    "id": "SEC-ENHANCED-002",
    "domain": "Threats, Vulnerabilities & Mitigations",
    "difficulty": "Hard",
    "question": "An organization discovered that an employee clicked on a phishing link that installed ransomware. The malware encrypted several file shares. Which of the following would be MOST effective in minimizing the impact of similar future attacks?",
    "choices": {
      "A": "Implement email filtering with sandboxing",
      "B": "Conduct regular security awareness training",
      "C": "Deploy application whitelisting on endpoints",
      "D": "Implement network segmentation with least privilege"
    },
    "answer": "C",
    "explanation": "While all are valuable controls, application whitelisting (C) is MOST effective at preventing ransomware execution even if a user clicks a phishing link. Email filtering (A) can be bypassed. Training (B) reduces risk but relies on human behavior. Segmentation (D) limits spread but doesn't prevent initial execution. Defense in depth requires all, but C provides the strongest technical control."
  },
  {
    "id": "SEC-ENHANCED-003",
    "domain": "Security Architecture",
    "difficulty": "Hard",
    "question": "A financial institution is designing a new web application that will process credit card transactions. The application must be PCI DSS compliant. Which architectural approach provides the BEST security while maintaining compliance?",
    "choices": {
      "A": "Store encrypted credit card data in the application database",
      "B": "Implement tokenization using a third-party payment processor",
      "C": "Use SSL/TLS to encrypt all data in transit",
      "D": "Implement strong access controls and audit logging"
    },
    "answer": "B",
    "explanation": "Tokenization (B) is BEST because it removes sensitive cardholder data from the environment entirely, significantly reducing PCI DSS scope. While encryption (A) protects data, you still store it and must meet all PCI requirements. TLS (C) is required but only protects data in transit. Access controls (D) are necessary but don't reduce the fundamental risk of storing card data."
  },
  {
    "id": "SEC-ENHANCED-004",
    "domain": "Security Program Management & Oversight",
    "difficulty": "Hard",
    "question": "After a security audit, multiple high-risk vulnerabilities were identified across the organization's infrastructure. Limited budget and resources are available. Which approach should be taken FIRST to prioritize remediation efforts?",
    "choices": {
      "A": "Patch all internet-facing systems before internal systems",
      "B": "Conduct a business impact analysis to identify critical assets",
      "C": "Implement compensating controls for all high-risk findings",
      "D": "Focus on vulnerabilities with published exploits"
    },
    "answer": "B",
    "explanation": "Business impact analysis (B) should be done FIRST to understand which assets are most critical to business operations and contain the most sensitive data. This enables risk-based prioritization. While external systems (A) are often higher risk, some internal systems may be more critical. Compensating controls (C) should be based on risk prioritization. Exploit availability (D) is one factor but not the primary driver - a critical system with an unexploited vulnerability may need attention before a non-critical system with a published exploit."
  },
  {
    "id": "SEC-ENHANCED-005",
    "domain": "Security Operations",
    "difficulty": "Hard",
    "question": "A SIEM administrator notices a pattern of failed login attempts from multiple IP addresses targeting the same administrative account over a 24-hour period. Each IP attempts only 2-3 logins before moving to the next IP. Which threat is MOST likely occurring?",
    "choices": {
      "A": "Brute force attack using distributed botnet",
      "B": "Password spraying attack",
      "C": "Credential stuffing attack",
      "D": "Dictionary attack"
    },
    "answer": "B",
    "explanation": "Password spraying (B) is MOST likely - the pattern of few attempts per IP targeting one account is characteristic of spraying to avoid account lockouts. Brute force (A) typically has many attempts from fewer sources. Credential stuffing (C) uses known username/password pairs across multiple accounts. Dictionary attacks (D) try many passwords against one account from the same source. The distributed, low-volume attempts targeting one admin account is the key indicator of password spraying."
  },
  {
    "id": "SEC-ENHANCED-006",
    "domain": "Threats, Vulnerabilities & Mitigations",
    "difficulty": "Hard",
    "question": "A company wants to protect against SQL injection in their legacy web application. The application cannot be rewritten in the short term. Which mitigation provides the BEST security improvement with minimal code changes?",
    "choices": {
      "A": "Implement a web application firewall (WAF)",
      "B": "Use parameterized queries for all database interactions",
      "C": "Implement strict input validation on all user inputs",
      "D": "Apply least privilege to database service accounts"
    },
    "answer": "B",
    "explanation": "Parameterized queries (B) are the BEST mitigation that can be implemented gradually with code changes limited to database interaction points. This provides robust protection. WAF (A) is good as a compensating control but can be bypassed and requires ongoing tuning. Input validation (C) requires changes throughout the application and can be incomplete. Least privilege (D) limits damage but doesn't prevent SQL injection. While B requires code changes, they're targeted and provide the strongest protection."
  },
  {
    "id": "SEC-ENHANCED-007",
    "domain": "Security Architecture",
    "difficulty": "Medium",
    "question": "An organization needs to allow contractors remote access to specific internal applications but wants to minimize the attack surface. Which solution provides the BEST security while maintaining usability?",
    "choices": {
      "A": "Implement a VPN with full network access",
      "B": "Deploy a jump box in a DMZ",
      "C": "Implement a zero-trust network access (ZTNA) solution",
      "D": "Use Remote Desktop Gateway with MFA"
    },
    "answer": "C",
    "explanation": "ZTNA (C) is BEST because it provides least privilege access to specific applications, not the entire network, while continuously verifying trust. VPN (A) grants too much network access. Jump box (B) improves security but still provides broader access than needed. RD Gateway (D) is good for Windows environments but ZTNA provides more granular, application-level access control regardless of platform. ZTNA embodies zero-trust principles most effectively."
  },
  {
    "id": "SEC-ENHANCED-008",
    "domain": "Security Operations",
    "difficulty": "Hard",
    "question": "During incident response, a security analyst discovers malware on a critical database server. The server contains active customer transactions. Which action should be taken FIRST?",
    "choices": {
      "A": "Isolate the server from the network immediately",
      "B": "Take a forensic image of the server for analysis",
      "C": "Document the current state and notify management",
      "D": "Run antivirus to remove the malware"
    },
    "answer": "C",
    "explanation": "Document and notify management FIRST (C) because the server is critical with active transactions. Management must decide between business continuity and containment. Immediate isolation (A) might be appropriate but could cause significant business impact requiring management approval. Imaging (B) and running AV (D) come after the initial assessment and management decision. This is about balancing security response with business needs - a judgment call requiring management input for critical systems."
  },
  {
    "id": "SEC-ENHANCED-009",
    "domain": "Security Program Management & Oversight",
    "difficulty": "Hard",
    "question": "A company is implementing a new security framework. The CISO needs executive buy-in for a significant security budget increase. Which metric would be MOST effective in communicating security value to the board?",
    "choices": {
      "A": "Number of vulnerabilities remediated per quarter",
      "B": "Mean time to detect (MTTD) and respond (MTTR) to incidents",
      "C": "Percentage of employees completing security training",
      "D": "Risk reduction in monetary terms with ROI calculations"
    },
    "answer": "D",
    "explanation": "Risk reduction in monetary terms with ROI (D) is MOST effective for board communication as executives think in business and financial terms. While MTTD/MTTR (B) are valuable operational metrics, translating security improvements to financial risk reduction and return on investment resonates with board members. Vulnerability counts (A) and training completion (C) are important metrics but don't directly communicate business value. The board needs to understand: 'If we spend $X, we reduce potential loss by $Y.'"
  },
  {
    "id": "SEC-ENHANCED-010",
    "domain": "Threats, Vulnerabilities & Mitigations",
    "difficulty": "Medium",
    "question": "A security team identified that an application is vulnerable to cross-site scripting (XSS). Multiple remediation options are being considered. Which approach provides the MOST comprehensive protection?",
    "choices": {
      "A": "Implement Content Security Policy (CSP) headers",
      "B": "Encode all user input before displaying it",
      "C": "Use an output encoding library for all user-controlled data",
      "D": "Validate and sanitize all input on the server side"
    },
    "answer": "C",
    "explanation": "Output encoding library (C) is MOST comprehensive because it systematically handles encoding at the point of output in a consistent, tested manner. CSP (A) is defense-in-depth but doesn't prevent XSS, only mitigates impact. Encoding input before display (B) is correct approach but 'before displaying' is ambiguous - encoding must be context-aware (HTML, JavaScript, URL, etc.). Input validation (D) is necessary but insufficient - you must also encode output. A mature encoding library provides context-aware encoding for all scenarios."
  },
  {
    "id": "SEC-ENHANCED-011",
    "domain": "Security Architecture",
    "difficulty": "Hard",
    "question": "An organization is migrating critical workloads to the cloud. They must maintain compliance with data sovereignty requirements. Which cloud architecture BEST addresses this requirement while maintaining high availability?",
    "choices": {
      "A": "Multi-cloud deployment across different providers",
      "B": "Single cloud region with multiple availability zones",
      "C": "Hybrid cloud with on-premises primary and cloud backup",
      "D": "Multi-region deployment within the same geographic boundary"
    },
    "answer": "D",
    "explanation": "Multi-region deployment within geographic boundaries (D) BEST balances data sovereignty compliance with high availability. Data stays within required geography while leveraging multiple regions for resilience. Multi-cloud (A) adds complexity without addressing sovereignty unless carefully architected. Single region (B) provides less resilience than multi-region. Hybrid (C) maintains sovereignty but cloud backup may defeat the purpose if the backup crosses boundaries. Option D directly addresses both constraints."
  },
  {
    "id": "SEC-ENHANCED-012",
    "domain": "Security Operations",
    "difficulty": "Medium",
    "question": "A company's web application is experiencing a surge in traffic that is overwhelming the servers. Analysis shows requests are coming from legitimate-looking sources with proper HTTP headers. Which attack is MOST likely occurring?",
    "choices": {
      "A": "DDoS amplification attack",
      "B": "Slowloris attack",
      "C": "Application-layer DDoS attack",
      "D": "SYN flood attack"
    },
    "answer": "C",
    "explanation": "Application-layer DDoS (C) is MOST likely given legitimate-looking requests with proper headers overwhelming the application. Amplification attacks (A) typically show abnormal traffic patterns. Slowloris (B) uses slow connections to exhaust resources but doesn't create a traffic surge. SYN flood (D) occurs at the network layer and wouldn't have complete HTTP headers. Application-layer attacks mimic legitimate traffic, making them harder to detect and the key indicator here."
  },
  {
    "id": "SEC-ENHANCED-013",
    "domain": "Security Architecture",
    "difficulty": "Hard",
    "question": "A healthcare organization needs to share patient data with multiple partner hospitals while maintaining HIPAA compliance. Which approach BEST balances security, compliance, and operational efficiency?",
    "choices": {
      "A": "Implement point-to-point VPNs between each hospital",
      "B": "Use a health information exchange (HIE) platform with role-based access",
      "C": "Email encrypted files with password protection",
      "D": "Use a secure FTP server with unique credentials per partner"
    },
    "answer": "B",
    "explanation": "HIE platform with RBAC (B) is BEST as it's purpose-built for healthcare data sharing with built-in audit trails, consent management, and standardized data formats. Point-to-point VPNs (A) don't scale well and lack centralized access control. Encrypted email (C) lacks proper audit trails and is operationally inefficient. SFTP (D) is better than email but lacks the healthcare-specific controls and interoperability standards that HIE provides. HIE directly addresses the healthcare use case with appropriate safeguards."
  },
  {
    "id": "SEC-ENHANCED-014",
    "domain": "Threats, Vulnerabilities & Mitigations",
    "difficulty": "Hard",
    "question": "A penetration tester successfully exploited a vulnerability and gained initial access to a web server. To maintain persistence, which technique would MOST likely be used FIRST?",
    "choices": {
      "A": "Create a new local administrator account",
      "B": "Install a rootkit to hide processes",
      "C": "Establish a reverse shell with command and control",
      "D": "Modify system startup scripts"
    },
    "answer": "C",
    "explanation": "Establishing a reverse shell to C2 (C) would be done FIRST as it provides immediate, persistent access for the attacker to maintain control even if the initial exploit vector is closed. Creating accounts (A) is more likely to be detected by user audits. Rootkits (B) require more privilege and time. Startup scripts (D) provide persistence but are checked less frequently than active connections. C2 establishment is the immediate priority after initial access in modern attack chains."
  },
  {
    "id": "SEC-ENHANCED-015",
    "domain": "Security Operations",
    "difficulty": "Hard",
    "question": "A SOC analyst investigating a security alert discovers that a workstation has been communicating with a known malicious IP address. The workstation belongs to a C-level executive. Which action should the analyst take FIRST?",
    "choices": {
      "A": "Immediately disconnect the workstation from the network",
      "B": "Collect volatile memory and network traffic for forensic analysis",
      "C": "Escalate to the incident response team and notify management",
      "D": "Run endpoint detection and response (EDR) scan on the workstation"
    },
    "answer": "C",
    "explanation": "Escalate to IR team and notify management FIRST (C) because this involves a high-profile executive with potential business impact and political considerations. The IR team can coordinate the appropriate response. Immediate disconnection (A) might be premature and disrupt executive operations without proper authorization. Evidence collection (B) and EDR scan (D) are important but should be coordinated through the IR process. Executive involvement requires management awareness for decision-making authority."
  },
  {
    "id": "SEC-ENHANCED-016",
    "domain": "Security Program Management & Oversight",
    "difficulty": "Medium",
    "question": "An organization wants to measure the effectiveness of its security awareness training program. Which metric would provide the MOST meaningful insight into program effectiveness?",
    "choices": {
      "A": "Percentage of employees who completed the training",
      "B": "Average score on post-training assessments",
      "C": "Reduction in successful phishing simulation click rates over time",
      "D": "Number of security incidents reported by employees"
    },
    "answer": "C",
    "explanation": "Reduction in phishing click rates (C) is MOST meaningful as it measures actual behavior change, not just knowledge. Completion rates (A) measure compliance, not effectiveness. Test scores (B) measure knowledge retention but not behavior application. Incident reports (D) can indicate awareness but may reflect actual threats, not program effectiveness. Simulated phishing results directly correlate training to real-world security behaviors, making it the best effectiveness indicator."
  },
  {
    "id": "SEC-ENHANCED-017",
    "domain": "Security Architecture",
    "difficulty": "Hard",
    "question": "A company is implementing a microservices architecture. Security requirements mandate that services can only communicate with explicitly authorized services. Which security pattern BEST implements this requirement?",
    "choices": {
      "A": "API gateway with rate limiting",
      "B": "Service mesh with mutual TLS and policy enforcement",
      "C": "Network segmentation with firewall rules",
      "D": "Container security scanning and runtime protection"
    },
    "answer": "B",
    "explanation": "Service mesh with mTLS and policy enforcement (B) is BEST for microservices as it provides identity-based authorization between services, encrypted communication, and fine-grained policy control. API gateway (A) manages external access but not service-to-service. Network segmentation (C) is too coarse-grained for dynamic microservices. Container scanning (D) addresses image security but not service communication. Service mesh is purpose-built for microservices security architecture."
  },
  {
    "id": "SEC-ENHANCED-018",
    "domain": "Threats, Vulnerabilities & Mitigations",
    "difficulty": "Medium",
    "question": "An organization identified that several employees are using the same password across multiple corporate applications. Which control would be MOST effective in preventing this practice?",
    "choices": {
      "A": "Implement password complexity requirements",
      "B": "Deploy a password manager for all employees",
      "C": "Enable password history to prevent reuse",
      "D": "Implement single sign-on (SSO) across applications"
    },
    "answer": "D",
    "explanation": "SSO (D) is MOST effective because it eliminates the need for multiple passwords entirely - users authenticate once and access all applications. Password managers (B) help but rely on user adoption. Complexity requirements (A) don't prevent reuse across systems. Password history (C) prevents reuse within the same system but not across different systems. SSO addresses the root cause: too many passwords leading users to reuse them."
  },
  {
    "id": "SEC-ENHANCED-019",
    "domain": "Security Operations",
    "difficulty": "Hard",
    "question": "A company's backup tapes are stored at an offsite facility. During a disaster recovery exercise, the team discovered that some backup tapes cannot be read. Which security control would have BEST prevented this issue?",
    "choices": {
      "A": "Implement encryption for all backup tapes",
      "B": "Perform regular backup restoration testing",
      "C": "Use a different backup vendor",
      "D": "Store backups in multiple geographic locations"
    },
    "answer": "B",
    "explanation": "Regular restoration testing (B) would have BEST prevented this by identifying unreadable tapes before an actual disaster. This is a core principle: backups aren't valid until proven restorable. Encryption (A) doesn't address readability. Different vendor (C) doesn't solve the testing problem. Multiple locations (D) improve availability but don't verify restore capability. The issue isn't where backups are stored but whether they can be restored - only testing validates this."
  },
  {
    "id": "SEC-ENHANCED-020",
    "domain": "Security Program Management & Oversight",
    "difficulty": "Hard",
    "question": "After a major security incident, the board of directors asks for assurance that similar incidents will be prevented. Which approach would provide the MOST comprehensive risk reduction?",
    "choices": {
      "A": "Implement all recommendations from the incident report",
      "B": "Conduct a comprehensive risk assessment and update the security roadmap",
      "C": "Hire additional security staff to improve monitoring",
      "D": "Purchase additional security tools to close identified gaps"
    },
    "answer": "B",
    "explanation": "Comprehensive risk assessment with updated roadmap (B) is MOST comprehensive as it identifies all risks, not just those related to one incident, and prioritizes mitigation based on overall organizational risk. Implementing incident recommendations (A) is reactive and may miss other critical risks. Additional staff (C) and tools (D) may help but should be based on a thorough risk assessment. Option B provides strategic, risk-based decision making rather than tactical responses."
  }
];

console.log('📚 Reading current questions...');
const questionsPath = path.join(__dirname, '../questions.json');
const currentQuestions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

console.log(`✅ Current questions: ${currentQuestions.length}`);
console.log(`➕ Adding enhanced questions: ${enhancedQuestions.length}`);

// Add enhanced questions to the array
const updatedQuestions = [...currentQuestions, ...enhancedQuestions];

console.log(`📝 Total questions after update: ${updatedQuestions.length}`);

// Write back to file
fs.writeFileSync(
  questionsPath,
  JSON.stringify(updatedQuestions, null, 2),
  'utf8'
);

console.log('\n✅ Successfully added enhanced questions to questions.json');
console.log('\n🎯 Enhanced Question Features:');
console.log('   • Multiple technically correct answers');
console.log('   • Requires prioritization and tradeoffs');
console.log('   • Includes real-world context and constraints');
console.log('   • Detailed explanations why other options are less optimal');
console.log('   • True CompTIA "BEST/MOST/FIRST" style ambiguity');

console.log('\n⚠️  Next steps:');
console.log('   1. Restart the server to reload questions');
console.log('   2. Consider reviewing existing questions for similar improvements');
console.log('   3. The database will auto-import new questions on next startup\n');
