/**
 * Core Voice Templates Seed Data
 * Sprint 31 - Task 3: Core Voice Templates
 *
 * Comprehensive set of voice templates for Emirates NBD outreach
 * Categories: Introduction, Value Prop, Pain Point, CTA
 * Tones: Formal, Professional, Casual
 * Variants: Email, LinkedIn, Follow-up
 */

const coreTemplates = [
  // =================================================================
  // INTRODUCTION TEMPLATES
  // =================================================================

  // Email - Formal
  {
    template_type: 'introduction',
    category: 'email',
    tone: 'formal',
    template_text: 'Dear {title} {last_name},\n\nI hope this message finds you well. I am reaching out on behalf of Emirates NBD to discuss how we might support {company_name}\'s financial objectives.',
    variables: ['title', 'last_name', 'company_name'],
    priority: 85,
    conditions: {
      min_quality_score: 80,
      contact_tier: ['STRATEGIC'],
      company_size: ['enterprise']
    }
  },

  // Email - Professional
  {
    template_type: 'introduction',
    category: 'email',
    tone: 'professional',
    template_text: 'Dear {first_name},\n\nI hope you\'re having a great week. I\'m {sender_name} from Emirates NBD, and I wanted to connect with you about supporting {company_name}\'s growth in the UAE market.',
    variables: ['first_name', 'sender_name', 'company_name'],
    priority: 75,
    conditions: {
      min_quality_score: 50,
      company_size: ['midsize', 'scaleup']
    }
  },

  // Email - Casual
  {
    template_type: 'introduction',
    category: 'email',
    tone: 'casual',
    template_text: 'Hi {first_name},\n\nI came across {company_name} and was impressed by your work in {industry}. I\'m {sender_name} from Emirates NBD, and I think we could help you scale even faster.',
    variables: ['first_name', 'company_name', 'industry', 'sender_name'],
    priority: 65,
    conditions: {
      company_size: ['startup', 'scaleup'],
      license_type: ['Free Zone']
    }
  },

  // LinkedIn - Professional
  {
    template_type: 'introduction',
    category: 'linkedin',
    tone: 'professional',
    template_text: 'Hi {first_name}, I noticed your role at {company_name}. Emirates NBD has been helping companies like yours optimize their banking operations. Would love to connect and share some insights.',
    variables: ['first_name', 'company_name'],
    priority: 80,
    conditions: {}
  },

  // LinkedIn - Casual
  {
    template_type: 'introduction',
    category: 'linkedin',
    tone: 'casual',
    template_text: 'Hey {first_name}! Congrats on the growth at {company_name}. We\'ve been working with similar {industry} companies and thought you might find our approach interesting. Let\'s connect!',
    variables: ['first_name', 'company_name', 'industry'],
    priority: 70,
    conditions: {
      company_size: ['startup', 'scaleup']
    }
  },

  // =================================================================
  // VALUE PROPOSITION TEMPLATES
  // =================================================================

  // Email - Formal
  {
    template_type: 'value_prop',
    category: 'email',
    tone: 'formal',
    template_text: 'Emirates NBD provides comprehensive banking solutions tailored specifically for enterprises operating in the UAE. Our {product_name} offering has enabled companies similar to {company_name} to achieve {benefit}, while maintaining the highest standards of financial governance and compliance.',
    variables: ['product_name', 'company_name', 'benefit'],
    priority: 85,
    conditions: {
      min_quality_score: 80,
      company_size: ['enterprise']
    }
  },

  // Email - Professional
  {
    template_type: 'value_prop',
    category: 'email',
    tone: 'professional',
    template_text: 'As one of the region\'s leading banks, Emirates NBD has helped {industry} companies like {company_name} streamline their financial operations. Our {product_name} solution specifically addresses {pain_point}, delivering {benefit} without the complexity.',
    variables: ['industry', 'company_name', 'product_name', 'pain_point', 'benefit'],
    priority: 75,
    conditions: {
      min_quality_score: 50
    }
  },

  // Email - Casual
  {
    template_type: 'value_prop',
    category: 'email',
    tone: 'casual',
    template_text: 'We\'ve been working with fast-growing {industry} companies and found a pattern: they all struggle with {pain_point}. That\'s why we built {product_name} - it gives you {benefit} so you can focus on what you do best.',
    variables: ['industry', 'pain_point', 'product_name', 'benefit'],
    priority: 70,
    conditions: {
      company_size: ['startup', 'scaleup']
    }
  },

  // LinkedIn - Professional
  {
    template_type: 'value_prop',
    category: 'linkedin',
    tone: 'professional',
    template_text: 'Emirates NBD has been the banking partner for 100+ UAE {industry} companies. Our {product_name} helps you {benefit} with zero hassle.',
    variables: ['industry', 'product_name', 'benefit'],
    priority: 80,
    conditions: {}
  },

  // =================================================================
  // PAIN POINT TEMPLATES
  // =================================================================

  // Email - Formal
  {
    template_type: 'pain_point',
    category: 'email',
    tone: 'formal',
    template_text: 'Many enterprises in the {industry} sector face challenges with {pain_point}. This can result in {negative_impact}, affecting overall operational efficiency. Emirates NBD\'s {solution} addresses this directly by {how_it_helps}.',
    variables: ['industry', 'pain_point', 'negative_impact', 'solution', 'how_it_helps'],
    priority: 85,
    conditions: {
      min_quality_score: 70,
      company_size: ['enterprise', 'midsize']
    }
  },

  // Email - Professional
  {
    template_type: 'pain_point',
    category: 'email',
    tone: 'professional',
    template_text: 'I understand that {pain_point} is a common challenge for {industry} companies at your stage. What we\'ve seen work well is {solution}, which typically delivers {roi} within {timeframe}.',
    variables: ['pain_point', 'industry', 'solution', 'roi', 'timeframe'],
    priority: 75,
    conditions: {
      min_quality_score: 50
    }
  },

  // Email - Casual
  {
    template_type: 'pain_point',
    category: 'email',
    tone: 'casual',
    template_text: 'Let me guess - you\'re probably dealing with {pain_point} like most {industry} startups. We get it. That\'s exactly why we created {solution}. It cuts {pain_point} down by {roi}.',
    variables: ['pain_point', 'industry', 'solution', 'roi'],
    priority: 70,
    conditions: {
      company_size: ['startup', 'scaleup']
    }
  },

  // =================================================================
  // CALL-TO-ACTION TEMPLATES
  // =================================================================

  // Email - Formal (Direct Meeting)
  {
    template_type: 'cta',
    category: 'email',
    tone: 'formal',
    template_text: 'I would be pleased to arrange a meeting at your convenience to discuss how Emirates NBD can support {company_name}\'s strategic objectives. Would {meeting_day} at {meeting_time} work for your schedule?',
    variables: ['company_name', 'meeting_day', 'meeting_time'],
    optional_variables: [],
    priority: 90,
    conditions: {
      contact_tier: ['STRATEGIC'],
      min_quality_score: 80
    }
  },

  // Email - Professional (Soft CTA)
  {
    template_type: 'cta',
    category: 'email',
    tone: 'professional',
    template_text: 'Would you be open to a brief call to explore how we might help {company_name}? I\'d love to share some specific examples from similar {industry} companies. Let me know what works best for you!',
    variables: ['company_name', 'industry'],
    priority: 75,
    conditions: {
      min_quality_score: 50
    }
  },

  // Email - Casual
  {
    template_type: 'cta',
    category: 'email',
    tone: 'casual',
    template_text: 'Want to chat about this? I can walk you through how we\'ve helped other {industry} companies solve {pain_point}. 15 minutes, your schedule - just let me know!',
    variables: ['industry', 'pain_point'],
    priority: 70,
    conditions: {
      company_size: ['startup', 'scaleup']
    }
  },

  // Email - Time-bound CTA
  {
    template_type: 'cta',
    category: 'email',
    tone: 'professional',
    template_text: 'We\'re currently working with select {industry} companies for our {quarter} cohort. If you\'re interested in learning more, I\'d be happy to schedule a call this week. Does {meeting_day} work?',
    variables: ['industry', 'quarter', 'meeting_day'],
    priority: 85,
    conditions: {
      timing_score: 75
    }
  },

  // LinkedIn - Professional CTA
  {
    template_type: 'cta',
    category: 'linkedin',
    tone: 'professional',
    template_text: 'If you\'re open to it, I\'d love to share how we\'ve helped similar companies. Quick 10-min call work?',
    variables: [],
    priority: 80,
    conditions: {}
  },

  // LinkedIn - Casual CTA
  {
    template_type: 'cta',
    category: 'linkedin',
    tone: 'casual',
    template_text: 'Let\'s connect! Would love to share what we\'re doing in the {industry} space.',
    variables: ['industry'],
    priority: 75,
    conditions: {}
  },

  // =================================================================
  // FOLLOW-UP TEMPLATES
  // =================================================================

  // Follow-up 1 - Professional
  {
    template_type: 'introduction',
    category: 'followup_1',
    tone: 'professional',
    template_text: 'Hi {first_name},\n\nI wanted to follow up on my previous message about supporting {company_name}. I understand you\'re busy, but I thought you might find this relevant: {new_insight}.',
    variables: ['first_name', 'company_name', 'new_insight'],
    priority: 75,
    conditions: {}
  },

  // Follow-up 2 - Professional (Value Add)
  {
    template_type: 'value_prop',
    category: 'followup_2',
    tone: 'professional',
    template_text: 'I came across this insight about {industry} and thought of {company_name}: {insight}. This is exactly what our {product_name} helps with. Still interested in chatting?',
    variables: ['industry', 'company_name', 'insight', 'product_name'],
    priority: 70,
    conditions: {}
  },

  // Follow-up 3 - Casual (Last Touch)
  {
    template_type: 'cta',
    category: 'followup_3',
    tone: 'casual',
    template_text: 'Last ping {first_name}! I know timing isn\'t always right, but if you ever want to discuss {pain_point}, I\'m here. No pressure!',
    variables: ['first_name', 'pain_point'],
    priority: 60,
    conditions: {}
  },

  // =================================================================
  // FULL MESSAGE TEMPLATES (Complete Emails)
  // =================================================================

  // Email - Professional Full Message
  {
    template_type: 'full_message',
    category: 'email',
    tone: 'professional',
    subject_template: '{benefit} for {company_name}',
    template_text: `Dear {first_name},

I hope you're having a great week. I'm {sender_name} from Emirates NBD, and I wanted to connect with you about supporting {company_name}'s growth in the UAE market.

As one of the region's leading banks, Emirates NBD has helped {industry} companies like yours streamline their financial operations. Our {product_name} solution specifically addresses {pain_point}, delivering {benefit} without the complexity.

I understand that {pain_point} is a common challenge for {industry} companies at your stage. What we've seen work well is {solution}, which typically delivers {roi} within {timeframe}.

Would you be open to a brief call to explore how we might help {company_name}? I'd love to share some specific examples from similar {industry} companies. Let me know what works best for you!

Best regards,
{sender_name}
Emirates NBD`,
    variables: [
      'first_name', 'sender_name', 'company_name', 'industry',
      'product_name', 'pain_point', 'benefit', 'solution',
      'roi', 'timeframe'
    ],
    priority: 80,
    conditions: {
      min_quality_score: 50,
      company_size: ['midsize', 'scaleup']
    }
  }
];

module.exports = { coreTemplates };
