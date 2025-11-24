// routes/tools.js
// API routes for helper tools: PDF extraction, URL fetching, text processing

import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { ok, bad } from '../utils/respond.js';
import { adminOnly } from '../utils/adminOnly.js';

// Import CommonJS module pdf-parse using require
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const router = express.Router();

// Configure multer for PDF uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

/**
 * POST /api/tools/extract-pdf
 * Extract text content from uploaded PDF file
 * Body: multipart/form-data with 'pdf' field
 */
router.post('/extract-pdf', adminOnly, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return bad(res, 'No PDF file uploaded', 400);
    }

    // Parse PDF buffer
    const pdfData = await pdfParse(req.file.buffer);

    const extractedData = {
      text: pdfData.text,
      numPages: pdfData.numpages,
      info: pdfData.info,
      metadata: pdfData.metadata,
      // Clean and format the text
      cleanedText: cleanExtractedText(pdfData.text),
      // Extract potential key information
      extractedInfo: extractKeyInformation(pdfData.text)
    };

    console.log(`PDF extracted: ${req.file.originalname}, ${pdfData.numpages} pages, ${pdfData.text.length} characters`);

    return ok(res, extractedData);
  } catch (error) {
    console.error('POST /api/tools/extract-pdf error:', error);
    return bad(res, `Failed to extract PDF: ${error.message}`, 500);
  }
});

/**
 * POST /api/tools/fetch-url
 * Fetch and extract content from a URL
 * Body: { url: string }
 */
router.post('/fetch-url', adminOnly, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return bad(res, 'URL is required', 400);
    }

    // Validate URL format
    let validUrl;
    try {
      validUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (error) {
      return bad(res, 'Invalid URL format', 400);
    }

    // Fetch URL content
    const response = await fetch(validUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UPR-Bot/1.0; +https://upr.ai)',
      },
      redirect: 'follow',
      timeout: 10000 // 10 second timeout
    });

    if (!response.ok) {
      return bad(res, `Failed to fetch URL: ${response.status} ${response.statusText}`, response.status);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Extract content based on content type
    let extractedData = {
      url: validUrl.toString(),
      contentType,
      rawText: text,
      extractedInfo: {}
    };

    if (contentType.includes('text/html')) {
      extractedData = {
        ...extractedData,
        ...extractHTMLContent(text, validUrl.toString())
      };
    } else if (contentType.includes('application/json')) {
      try {
        extractedData.jsonData = JSON.parse(text);
      } catch (e) {
        extractedData.parseError = 'Failed to parse JSON';
      }
    } else {
      extractedData.cleanedText = cleanExtractedText(text);
      extractedData.extractedInfo = extractKeyInformation(text);
    }

    console.log(`URL fetched: ${validUrl.toString()}, ${text.length} characters`);

    return ok(res, extractedData);
  } catch (error) {
    console.error('POST /api/tools/fetch-url error:', error);
    return bad(res, `Failed to fetch URL: ${error.message}`, 500);
  }
});

/**
 * POST /api/tools/extract-info
 * Extract structured information from raw text
 * Body: { text: string }
 */
router.post('/extract-info', adminOnly, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return bad(res, 'Text is required', 400);
    }

    const extractedInfo = extractKeyInformation(text);
    const cleanedText = cleanExtractedText(text);

    return ok(res, {
      originalLength: text.length,
      cleanedLength: cleanedText.length,
      cleanedText,
      extractedInfo
    });
  } catch (error) {
    console.error('POST /api/tools/extract-info error:', error);
    return bad(res, `Failed to extract info: ${error.message}`, 500);
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Clean extracted text (remove extra whitespace, normalize line breaks)
 */
function cleanExtractedText(text) {
  return text
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove multiple consecutive line breaks (keep max 2)
    .replace(/\n{3,}/g, '\n\n')
    // Remove extra spaces
    .replace(/ {2,}/g, ' ')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();
}

/**
 * Extract key information from text (emails, phones, URLs, companies, etc.)
 */
function extractKeyInformation(text) {
  const info = {
    emails: [],
    phones: [],
    urls: [],
    companies: [],
    financialTerms: [],
    locations: []
  };

  // Extract emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = text.match(emailRegex);
  if (emails) {
    info.emails = [...new Set(emails)];
  }

  // Extract phone numbers (various formats)
  const phoneRegex = /(\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/g;
  const phones = text.match(phoneRegex);
  if (phones) {
    info.phones = [...new Set(phones.filter(p => p.replace(/\D/g, '').length >= 8))];
  }

  // Extract URLs
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-z0-9-]+\.(com|io|net|org|ai|co|ae)(?:\/[^\s]*)?)/gi;
  const urls = text.match(urlRegex);
  if (urls) {
    info.urls = [...new Set(urls)];
  }

  // Extract potential company names (capitalized phrases)
  const companyRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}(?:\s+(?:LLC|Ltd|Inc|Corp|Co|Group|Bank|Financial|Services|Solutions|Technologies))?)\b/g;
  const companies = text.match(companyRegex);
  if (companies) {
    info.companies = [...new Set(companies)].slice(0, 10); // Limit to 10
  }

  // Extract financial terms (AED, USD, percentages, etc.)
  const financialRegex = /(?:AED|USD|EUR|GBP|SAR)\s*[\d,]+(?:\.\d{2})?|\d+(?:\.\d+)?%|[\d,]+(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)/gi;
  const financial = text.match(financialRegex);
  if (financial) {
    info.financialTerms = [...new Set(financial)].slice(0, 20);
  }

  // Extract UAE locations
  const locationRegex = /\b(Dubai|Abu Dhabi|Sharjah|Ajman|Umm Al Quwain|Ras Al Khaimah|Fujairah|UAE|United Arab Emirates|DIFC|ADGM)\b/gi;
  const locations = text.match(locationRegex);
  if (locations) {
    info.locations = [...new Set(locations.map(l => l.trim()))];
  }

  return info;
}

/**
 * Extract content from HTML
 */
function extractHTMLContent(html, url) {
  // Simple HTML parsing (for production, consider using a proper HTML parser like cheerio)
  const result = {
    title: '',
    description: '',
    cleanedText: '',
    extractedInfo: {}
  };

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // Extract meta description
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  // Remove script and style tags
  let cleanedHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML tags
  let textContent = cleanedHtml
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  result.cleanedText = cleanExtractedText(textContent);
  result.extractedInfo = extractKeyInformation(result.cleanedText);

  // Try to detect if it's a LinkedIn company page
  if (url.includes('linkedin.com/company')) {
    result.source = 'linkedin_company';
    // Extract company slug from URL
    const slugMatch = url.match(/linkedin\.com\/company\/([^\/\?]+)/);
    if (slugMatch) {
      result.linkedinSlug = slugMatch[1];
    }
  }

  return result;
}

export default router;
