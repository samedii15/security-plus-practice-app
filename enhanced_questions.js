// Enhanced CompTIA-Style Questions with BEST/MOST/FIRST Ambiguity
// These questions have multiple technically correct answers, but only ONE is best

export const enhancedQuestions = [
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
  }
];

console.log(`
🎯 Enhanced Questions with BEST/MOST/FIRST Ambiguity

Created ${enhancedQuestions.length} new questions featuring:

✓ Multiple technically correct answers
✓ Requires reasoning and prioritization  
✓ Forces tradeoffs between options
✓ Includes constraints and context
✓ Detailed explanations of why other options fall short

These questions match real CompTIA Security+ exam style where
test-takers must choose the BEST answer, not just a correct one.
`);

export default enhancedQuestions;
