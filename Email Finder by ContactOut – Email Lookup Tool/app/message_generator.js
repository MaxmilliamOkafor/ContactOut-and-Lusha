/**
 * OutreachPro — AI Message Generator (Local, Unlimited)
 * 
 * Generates personalized outreach messages by matching the user's
 * CV/background against the prospect's LinkedIn profile data.
 * 
 * Runs 100% locally — zero API calls, zero tokens, zero limits.
 */
const OutreachMessageGenerator = (() => {
  'use strict';

  // ─── Tone Profiles ───────────────────────────────────────────
  const TONES = {
    professional: {
      greeting: ['Hi', 'Hello', 'Dear'],
      opener: [
        'I came across your profile and was impressed by',
        'Your work in {industry} caught my attention, particularly',
        'I noticed your experience with',
        'I was drawn to your background in',
      ],
      bridge: [
        'I believe there\'s a strong alignment between our experiences.',
        'My background in {userSkill} complements your work in {prospectArea}.',
        'I see significant overlap between our professional interests.',
        'Having worked in {userIndustry}, I appreciate your expertise in {prospectArea}.',
      ],
      closer: [
        'Would you be open to connecting?',
        'I\'d welcome the opportunity to exchange insights.',
        'I look forward to the possibility of connecting.',
        'I\'d value the chance to learn from your experience.',
      ],
      signoff: ['Best regards', 'Kind regards', 'Best', 'Sincerely'],
    },
    casual: {
      greeting: ['Hey', 'Hi there', 'Hi'],
      opener: [
        'Saw your profile and thought your work on',
        'Your background in {industry} is really cool, especially',
        'Noticed we\'re both into',
        'Love what you\'re doing at',
      ],
      bridge: [
        'I\'m working on similar things and think we could swap some great ideas.',
        'I\'m in {userIndustry} too, so I totally get what you\'re building.',
        'We seem to run in similar circles — would love to connect!',
        'Always great to meet people who share a passion for {prospectArea}.',
      ],
      closer: [
        'Down to connect?',
        'Let\'s link up!',
        'Would be great to chat sometime.',
        'Let me know if you\'re open to connecting!',
      ],
      signoff: ['Cheers', 'Talk soon', 'Best', ''],
    },
    enthusiastic: {
      greeting: ['Hi', 'Hello', 'Hey'],
      opener: [
        'I\'m genuinely excited about your work in',
        'Your profile really stands out — especially your experience with',
        'I\'ve been following developments in {industry} and your work on',
        'Wow — your journey at {company} is incredibly inspiring, particularly',
      ],
      bridge: [
        'As someone passionate about {userSkill}, I find your approach fascinating!',
        'I\'m building expertise in {userIndustry} and would absolutely love your perspective.',
        'The synergy between your {prospectArea} work and my {userSkill} background is exciting!',
        'I\'m on a similar path in {userIndustry} and your insights would be invaluable.',
      ],
      closer: [
        'I\'d be thrilled to connect and learn from you!',
        'Would love to hear more about your incredible work!',
        'Really hoping we can connect — you\'re doing amazing things!',
        'Can\'t wait to potentially collaborate!',
      ],
      signoff: ['Best', 'Warmly', 'With enthusiasm', 'Cheers'],
    },
    witty: {
      greeting: ['Hey', 'Hi there', 'Hi'],
      opener: [
        'LinkedIn said we might know each other — I think the algorithm got one right for once. Your work in',
        'Before this gets lost in a sea of "Let\'s connect!" messages — I genuinely admire your',
        'Plot twist: a LinkedIn message that isn\'t a sales pitch. Your background in',
        'Not gonna lie, your profile on {industry} had me scrolling way too long, especially',
      ],
      bridge: [
        'I\'m in the {userIndustry} space myself, so I can actually appreciate what you\'re doing (not just pretending to).',
        'As a fellow {userSkill} enthusiast, I promise our conversations would be more interesting than most LinkedIn threads.',
        'I think we\'d have a lot to talk about — {userIndustry} meets {prospectArea} is always an interesting combo.',
        'My {userSkill} background keeps me busy, but I always make time for interesting people in {prospectArea}.',
      ],
      closer: [
        'No calendar link, no pitch deck — just a genuine connection request.',
        'Zero ulterior motives, just good old-fashioned professional networking!',
        'Let\'s connect before LinkedIn starts charging for this too.',
        'If this resonated even a little — let\'s connect!',
      ],
      signoff: ['Cheers', 'Best', '✌️', ''],
    },
  };

  // ─── Utility Functions ───────────────────────────────────────
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function firstName(fullName) {
    if (!fullName) return 'there';
    return fullName.split(' ')[0];
  }

  function fillPlaceholders(text, vars) {
    return text
      .replace(/\{company\}/g, vars.company || 'your company')
      .replace(/\{industry\}/g, vars.industry || 'your industry')
      .replace(/\{prospectArea\}/g, vars.prospectArea || 'your field')
      .replace(/\{userSkill\}/g, vars.userSkill || 'my field')
      .replace(/\{userIndustry\}/g, vars.userIndustry || 'the industry')
      .replace(/\{jobTitle\}/g, vars.jobTitle || 'the role')
      .replace(/\{prospectName\}/g, vars.prospectName || 'there')
      .replace(/\{userName\}/g, vars.userName || '');
  }

  function extractIndustry(headline, experience) {
    const combined = `${headline || ''} ${experience || ''}`.toLowerCase();
    const industries = [
      'technology', 'software engineering', 'data science', 'AI', 'machine learning',
      'product management', 'marketing', 'sales', 'finance', 'consulting',
      'healthcare', 'design', 'engineering', 'operations', 'HR',
      'real estate', 'education', 'legal', 'media', 'e-commerce',
      'cybersecurity', 'cloud computing', 'blockchain', 'SaaS', 'fintech',
      'biotech', 'analytics', 'devops', 'UX', 'growth',
    ];
    for (const ind of industries) {
      if (combined.includes(ind.toLowerCase())) return ind;
    }
    return null;
  }

  function extractTopSkills(aboutText, headline) {
    const combined = `${headline || ''} ${aboutText || ''}`.toLowerCase();
    const skillKeywords = [
      'python', 'javascript', 'react', 'node.js', 'aws', 'azure',
      'leadership', 'strategy', 'analytics', 'machine learning', 'data',
      'sales', 'marketing', 'project management', 'agile', 'scrum',
      'product', 'design', 'ux', 'ui', 'full-stack', 'backend',
      'frontend', 'devops', 'cloud', 'security', 'blockchain',
      'communication', 'negotiation', 'team building', 'innovation',
    ];
    return skillKeywords.filter(s => combined.includes(s)).slice(0, 3);
  }

  function findCommonGround(userCV, prospectData) {
    const commonalities = [];
    const userText = `${userCV.summary || ''} ${userCV.skills || ''} ${userCV.experience || ''}`.toLowerCase();
    const prospectText = `${prospectData.headline || ''} ${prospectData.about || ''} ${prospectData.company || ''}`.toLowerCase();

    // Shared skills
    const sharedSkills = extractTopSkills(userText, '').filter(s => prospectText.includes(s));
    if (sharedSkills.length > 0) {
      commonalities.push({ type: 'skill', value: sharedSkills[0] });
    }

    // Shared industry
    const userIndustry = extractIndustry(userCV.summary, userCV.experience);
    const prospectIndustry = extractIndustry(prospectData.headline, prospectData.about);
    if (userIndustry && prospectIndustry && userIndustry === prospectIndustry) {
      commonalities.push({ type: 'industry', value: userIndustry });
    }

    return commonalities;
  }

  // ─── Message Generators ──────────────────────────────────────

  /**
   * Connection Request (max ~300 chars for LinkedIn)
   */
  function generateConnectionRequest(prospectData, userCV, tone = 'professional') {
    const t = TONES[tone] || TONES.professional;
    const pName = firstName(prospectData.name);
    const prospectIndustry = extractIndustry(prospectData.headline, prospectData.about);
    const userSkills = userCV.skills ? userCV.skills.split(',')[0].trim() : '';
    const userIndustry = extractIndustry(userCV.summary, userCV.experience);
    const commonGround = findCommonGround(userCV, prospectData);

    const vars = {
      company: prospectData.company,
      industry: prospectIndustry,
      prospectArea: prospectData.headline ? prospectData.headline.split(' at ')[0].split(' | ')[0].trim() : prospectIndustry,
      userSkill: userSkills || userIndustry || 'my expertise',
      userIndustry: userIndustry || 'the industry',
      prospectName: pName,
      userName: userCV.name || '',
    };

    // Build specific detail reference
    let detail = '';
    if (prospectData.company) {
      detail = `your work at ${prospectData.company}`;
    } else if (prospectData.headline) {
      detail = prospectData.headline.split(' at ')[0].split(' | ')[0].trim().toLowerCase();
    } else {
      detail = 'your professional background';
    }

    // Common ground bonus
    let commonNote = '';
    if (commonGround.length > 0) {
      const cg = commonGround[0];
      if (cg.type === 'skill') {
        commonNote = ` As a fellow ${cg.value} professional,`;
      } else if (cg.type === 'industry') {
        commonNote = ` We\'re both in ${cg.value} —`;
      }
    }

    const greeting = `${pick(t.greeting)} ${pName},`;
    const opener = fillPlaceholders(pick(t.opener), vars) + ` ${detail} is impressive.`;
    const bridge = commonNote ? commonNote + ' ' + fillPlaceholders(pick(t.closer), vars) : fillPlaceholders(pick(t.closer), vars);

    let message = `${greeting} ${opener} ${bridge}`;

    // Enforce LinkedIn 300 char limit
    if (message.length > 295) {
      message = `${greeting} ${fillPlaceholders(pick(t.opener), vars)} ${detail} is impressive. ${fillPlaceholders(pick(t.closer), vars)}`;
    }
    if (message.length > 295) {
      message = `${greeting} ${fillPlaceholders(pick(t.opener), vars)} ${detail}. ${fillPlaceholders(pick(t.closer), vars)}`;
    }
    if (message.length > 295) {
      message = message.substring(0, 292) + '...';
    }

    return { type: 'connection_request', message, charCount: message.length, limit: 300 };
  }

  /**
   * Direct Message (longer format)
   */
  function generateDirectMessage(prospectData, userCV, tone = 'professional') {
    const t = TONES[tone] || TONES.professional;
    const pName = firstName(prospectData.name);
    const prospectIndustry = extractIndustry(prospectData.headline, prospectData.about);
    const userSkills = userCV.skills ? userCV.skills.split(',')[0].trim() : '';
    const userIndustry = extractIndustry(userCV.summary, userCV.experience);
    const commonGround = findCommonGround(userCV, prospectData);

    const vars = {
      company: prospectData.company,
      industry: prospectIndustry,
      prospectArea: prospectData.headline ? prospectData.headline.split(' at ')[0].split(' | ')[0].trim() : prospectIndustry,
      userSkill: userSkills || userIndustry || 'my area of expertise',
      userIndustry: userIndustry || 'the industry',
      prospectName: pName,
      userName: userCV.name || '',
    };

    const greeting = `${pick(t.greeting)} ${pName},`;
    const opener = fillPlaceholders(pick(t.opener), vars);

    let detail = '';
    if (prospectData.company && prospectData.headline) {
      detail = `your role as ${prospectData.headline.split(' at ')[0].trim()} at ${prospectData.company}`;
    } else if (prospectData.company) {
      detail = `your work at ${prospectData.company}`;
    } else if (prospectData.headline) {
      detail = `your experience as ${prospectData.headline.split(' | ')[0].trim()}`;
    } else {
      detail = 'your professional journey';
    }

    const bridge = fillPlaceholders(pick(t.bridge), vars);

    // About-section reference
    let aboutRef = '';
    if (prospectData.about && prospectData.about.length > 20) {
      const aboutSnippet = prospectData.about.substring(0, 80).trim();
      aboutRef = `\n\nI particularly resonated with your mention of "${aboutSnippet}..." — `;
      if (commonGround.length > 0 && commonGround[0].type === 'skill') {
        aboutRef += `it aligns closely with my work in ${commonGround[0].value}.`;
      } else {
        aboutRef += 'it reflects a mindset I share.';
      }
    }

    // User value proposition
    let valueProp = '';
    if (userCV.summary) {
      valueProp = `\n\nA bit about me: ${userCV.summary.substring(0, 150).trim()}`;
      if (userCV.summary.length > 150) valueProp += '...';
    }

    const closer = fillPlaceholders(pick(t.closer), vars);
    const signoff = pick(t.signoff);
    const nameSign = userCV.name ? `\n${userCV.name}` : '';

    const message = `${greeting}\n\n${opener} ${detail}.\n\n${bridge}${aboutRef}${valueProp}\n\n${closer}\n\n${signoff}${nameSign}`;

    return { type: 'direct_message', message };
  }

  /**
   * Email (full with subject line)
   */
  function generateEmail(prospectData, userCV, tone = 'professional') {
    const t = TONES[tone] || TONES.professional;
    const pName = firstName(prospectData.name);
    const prospectIndustry = extractIndustry(prospectData.headline, prospectData.about);
    const userSkills = userCV.skills ? userCV.skills.split(',')[0].trim() : '';
    const userIndustry = extractIndustry(userCV.summary, userCV.experience);

    const vars = {
      company: prospectData.company,
      industry: prospectIndustry,
      prospectArea: prospectData.headline ? prospectData.headline.split(' at ')[0].split(' | ')[0].trim() : prospectIndustry,
      userSkill: userSkills || userIndustry || 'my expertise',
      userIndustry: userIndustry || 'the industry',
      prospectName: pName,
      userName: userCV.name || '',
    };

    // Subject line
    const subjects = [
      `Connecting over ${vars.prospectArea || vars.industry || 'shared interests'}`,
      `Quick note about ${vars.company || 'your work'}`,
      `Reaching out — ${vars.userIndustry} professional`,
      `${vars.prospectArea || 'Your expertise'} caught my eye`,
      `Fellow ${vars.userIndustry || 'professional'} reaching out`,
    ];
    const subject = pick(subjects);

    const greeting = `${pick(t.greeting)} ${pName},`;
    const opener = fillPlaceholders(pick(t.opener), vars);

    let detail = '';
    if (prospectData.company && prospectData.headline) {
      detail = `your role as ${prospectData.headline.split(' at ')[0].trim()} at ${prospectData.company}`;
    } else if (prospectData.company) {
      detail = `your work at ${prospectData.company}`;
    } else {
      detail = 'your professional background';
    }

    const bridge = fillPlaceholders(pick(t.bridge), vars);

    // User background paragraph
    let background = '';
    if (userCV.experience) {
      background = `\n\nTo give you some context on my background: ${userCV.experience.substring(0, 200).trim()}`;
      if (userCV.experience.length > 200) background += '...';
    } else if (userCV.summary) {
      background = `\n\nAbout me: ${userCV.summary.substring(0, 200).trim()}`;
      if (userCV.summary.length > 200) background += '...';
    }

    // CTA
    const ctas = [
      'Would you have 15 minutes this week for a brief call?',
      'I\'d love to schedule a quick chat — does any time this week work?',
      'Would you be open to a 10-minute conversation?',
      'If you\'re open to it, I\'d love to set up a brief meeting.',
    ];
    const cta = pick(ctas);

    const signoff = pick(t.signoff);
    const nameSign = userCV.name ? `\n${userCV.name}` : '';

    const message = `Subject: ${subject}\n\n${greeting}\n\n${opener} ${detail}.\n\n${bridge}${background}\n\n${cta}\n\n${signoff}${nameSign}`;

    return { type: 'email', message, subject };
  }

  /**
   * Follow-up message
   */
  function generateFollowUp(prospectData, userCV, tone = 'professional') {
    const t = TONES[tone] || TONES.professional;
    const pName = firstName(prospectData.name);

    const openers = [
      `I wanted to follow up on my earlier message.`,
      `Just circling back on my previous note.`,
      `Hope you've been well since my last message!`,
      `I know your inbox is probably busy, so I wanted to send a quick follow-up.`,
    ];

    const bodies = [
      `I remain very interested in connecting with you${prospectData.company ? ` and learning more about the work at ${prospectData.company}` : ''}.`,
      `I'd still love the chance to exchange ideas${prospectData.headline ? ` — your experience in ${prospectData.headline.split(' at ')[0].split(' | ')[0].trim()} is really compelling` : ''}.`,
      `I believe there's genuine potential for a mutually beneficial conversation.`,
      `I think we could have some really interesting discussions${prospectData.company ? `, especially given what ${prospectData.company} is doing right now` : ''}.`,
    ];

    const closers = [
      'Would any time this week work for a quick chat?',
      'No pressure at all — just wanted to keep the door open.',
      'Even a brief exchange over LinkedIn would be great.',
      'Let me know if the timing is better now.',
    ];

    const greeting = `${pick(t.greeting)} ${pName},`;
    const opener = pick(openers);
    const body = pick(bodies);
    const closer = pick(closers);
    const signoff = pick(t.signoff);
    const nameSign = userCV.name ? `\n${userCV.name}` : '';

    const message = `${greeting}\n\n${opener} ${body}\n\n${closer}\n\n${signoff}${nameSign}`;

    return { type: 'follow_up', message };
  }

  // ─── Public API ──────────────────────────────────────────────
  return {
    generate(type, prospectData, userCV, tone) {
      const cvData = userCV || { name: '', summary: '', skills: '', experience: '' };
      switch (type) {
        case 'connection_request':
          return generateConnectionRequest(prospectData, cvData, tone);
        case 'direct_message':
          return generateDirectMessage(prospectData, cvData, tone);
        case 'email':
          return generateEmail(prospectData, cvData, tone);
        case 'follow_up':
          return generateFollowUp(prospectData, cvData, tone);
        default:
          return generateConnectionRequest(prospectData, cvData, tone);
      }
    },
    TONES: Object.keys(TONES),
  };
})();

// Export for use in content script
if (typeof window !== 'undefined') {
  window.OutreachMessageGenerator = OutreachMessageGenerator;
}
