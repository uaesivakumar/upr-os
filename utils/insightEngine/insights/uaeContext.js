export class UAEContext {
  constructor(company) {
    this.company = company;
  }

  async generate() {
    const companyId = this.company.id;
    const companyName = this.company.name;

    console.log(`[UAEContext] companyId=${companyId} name=${companyName}`);

    // DEBUG: Log full company object to diagnose UAE detection issues
    console.log(`[UAEContext] === FULL COMPANY OBJECT ===`);
    console.log(`[UAEContext] ${JSON.stringify(this.company, null, 2)}`);
    console.log(`[UAEContext] === END COMPANY OBJECT ===`);

    // Robust location check - combine all location fields
    const locationFields = [
      this.company.location,
      this.company.headquarters,
      this.company.hq,
      this.company.global_hq,      // ← ADD: Preview uses global_hq
      this.company.hq_location,
      this.company.address,
      this.company.city,
      this.company.country
    ].filter(Boolean).join(' ');

    // Normalize: lowercase, remove extra spaces
    const location = locationFields.toLowerCase().replace(/\s+/g, ' ').trim();

    console.log(`[UAEContext] companyId=${companyId} location="${location}"`);

    // Comprehensive UAE detection
    const isUAE =
      location.includes('uae') ||
      location.includes('u.a.e') ||
      location.includes('u a e') ||
      location.includes('dubai') ||
      location.includes('abu dhabi') ||
      location.includes('abudhabi') ||
      location.includes('sharjah') ||
      location.includes('ajman') ||
      location.includes('ras al khaimah') ||
      location.includes('fujairah') ||
      location.includes('umm al quwain') ||
      location.includes('united arab emirates') ||
      location.includes('emirates');

    if (!isUAE) {
      console.log(`[UAEContext] companyId=${companyId} NOT UAE (location="${location}")`);
      return null;
    }

    console.log(`[UAEContext] companyId=${companyId} IS UAE ✓`);

    // Government entity detection (name-based + sector)
    const companyNameLower = (this.company.name || '').toLowerCase();

    // Cached regex patterns for performance
    const governmentPatterns = [
      /\bgovernment\b/,
      /\bministry\b/,
      /\bauthority\b/,
      /\bcustoms\b/,
      /\bmunicipality\b/,
      /\bcouncil\b/,
      /\bmubadala\b/,
      /\badia\b/,
      /\bg42\b/,
      /\btecom\b/,
      /\badnoc\b/,
      /\benoc\b/,
      /\bdewa\b/,
      /\bsewa\b/,
      /\bemaar\b/,
      /\bfederal\b/,
      /\bnational\b.*\bbank\b/
    ];

    const isGovernment = governmentPatterns.some(pattern => pattern.test(companyNameLower)) ||
                        (this.company.sector || '').toLowerCase().includes('government') ||
                        (this.company.sector || '').toLowerCase().includes('public sector');

    // MNC detection (HQ outside UAE)
    const hqLocation = (this.company.headquarters || '').toLowerCase();
    const isMNC = hqLocation &&
                  !hqLocation.includes('uae') &&
                  !hqLocation.includes('dubai') &&
                  !hqLocation.includes('abu dhabi') &&
                  (hqLocation.includes('usa') ||
                   hqLocation.includes('uk') ||
                   hqLocation.includes('europe') ||
                   hqLocation.includes('asia') ||
                   hqLocation.includes('america'));

    console.log(`[UAEContext] companyId=${companyId} isGov=${isGovernment} isMNC=${isMNC}`);

    let culturalAdvice, details, recommendation;

    if (isGovernment) {
      culturalAdvice = 'GOVERNMENT ENTITY - SPECIAL PROTOCOLS';
      details = [
        '🏛️ Government procurement requires formal tender process',
        '🤝 Warm introduction is MANDATORY (cold calls will fail)',
        '🇦🇪 Must align with national development goals (UAE Vision 2030, AI strategy)',
        '⏰ Decision cycles: 9-18 months minimum',
        '📋 Requires local UAE presence and Arabic support'
      ];
      recommendation = '🚨 CRITICAL: DO NOT cold email government entities. You MUST get warm introduction from existing government client or government relations consultant. Reference national AI/digital transformation initiatives. Prepare for 12+ month sales cycle with formal RFP process.';
    } else if (isMNC) {
      culturalAdvice = 'MULTINATIONAL IN UAE - DUAL CULTURE';
      details = [
        '🌍 Reports to global HQ but operates in UAE context',
        '💼 Decision-making: Local HR + Global approval',
        '🇦🇪 Must comply with UAE labor law and visa regulations',
        '🤝 UAE business culture: Relationship-first, then business',
        '⏰ Be prepared for Ramadan slowdown (March-April)'
      ];
      recommendation = 'Navigate dual culture: Pitch global standards (HQ will require) but emphasize UAE expertise (local team needs). Decision will take longer due to global approval. Position as "global quality, local expertise." Best timing: Avoid Ramadan (March-April) and summer (July-August).';
    } else {
      culturalAdvice = 'UAE LOCAL COMPANY';
      details = [
        '🇦🇪 85% of UAE workforce are expats (banking/visa critical)',
        '🤝 Relationship-driven culture (warm intros highly effective)',
        '💬 English is business language (professional communication expected)',
        '⏰ Ramadan 2026: Feb 28 - Mar 29 (activity drops 40%)',
        '☀️ Summer slowdown: July-August (key staff on leave)'
      ];
      recommendation = 'UAE companies value long-term relationships over transactional sales. If possible, get warm introduction from mutual connection. Emphasize your UAE market expertise and understanding of expat onboarding (visa, banking, housing). Timing: Best months are Sep-Nov and Jan-Feb. Avoid Ramadan and summer.';
    }

    return {
      id: 'uae_context',
      category: 'cultural',
      icon: '🇦🇪',
      title: 'UAE Market Intelligence',
      priority: 5,
      content: {
        summary: culturalAdvice,
        details,
        metrics: {
          location: this.company.location,
          isGovernment,
          isMNC
        }
      },
      recommendation,
      confidence: 'high'
    };
  }
}
