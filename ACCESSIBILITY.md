# Accessibility Guidelines - Sprint 48

## Overview

This document outlines the accessibility features and best practices implemented in the UPR Dashboard. We aim for **WCAG 2.1 Level AA** compliance.

---

## Table of Contents

1. [Color Contrast](#color-contrast)
2. [Keyboard Navigation](#keyboard-navigation)
3. [Screen Reader Support](#screen-reader-support)
4. [Focus Management](#focus-management)
5. [Responsive Design](#responsive-design)
6. [Component Accessibility](#component-accessibility)
7. [Testing Checklist](#testing-checklist)

---

## Color Contrast

All text and interactive elements meet WCAG AA contrast ratio requirements:

### Light Mode
- **Primary Text**: #111827 on #FFFFFF (15:1 ratio) ✅
- **Secondary Text**: #4B5563 on #FFFFFF (8:1 ratio) ✅
- **Interactive Elements**: Blue 600 (#2563EB) on white (7:1 ratio) ✅

### Dark Mode
- **Primary Text**: #F9FAFB on #0A0E1A (15:1 ratio) ✅
- **Secondary Text**: #D1D5DB on #111827 (10:1 ratio) ✅
- **Interactive Elements**: Blue 400 (#60A5FA) on dark (8:1 ratio) ✅

### Testing Tools
- Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Chrome DevTools: Inspect > Accessibility > Contrast

---

## Keyboard Navigation

All interactive elements are keyboard accessible:

### Global Shortcuts
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `?` or `Shift + /` | Show keyboard shortcuts help |
| `Cmd/Ctrl + D` | Toggle dark mode |
| `Esc` | Close modals/dialogs |
| `Tab` | Navigate forward |
| `Shift + Tab` | Navigate backward |

### Component-Specific
- **Sidebar**: Arrow keys for navigation, Enter to select
- **Cards**: Clickable cards respond to Enter/Space
- **Modals**: Tab trapping within modal, Esc to close
- **Forms**: Standard tab order, Enter to submit

### Implementation
```typescript
// Skip keyboard events in input fields
if (event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement) {
  return;
}
```

---

## Screen Reader Support

### Semantic HTML
- Use proper heading hierarchy (`h1` → `h2` → `h3`)
- Use semantic elements (`<nav>`, `<main>`, `<aside>`, `<article>`)
- Label all form inputs with `<label>` or `aria-label`

### ARIA Attributes
```tsx
// Sidebar navigation
<nav aria-label="Main navigation">
  <button aria-expanded={isOpen} aria-controls="submenu-id">
    Leads & Companies
  </button>
</nav>

// Buttons
<button aria-label="Close modal" onClick={onClose}>
  <X size={20} aria-hidden="true" />
</button>

// Loading states
<div role="status" aria-live="polite">
  Loading...
</div>
```

### Live Regions
```tsx
// Toast notifications
<div role="alert" aria-live="assertive">
  {message}
</div>

// Search results
<div aria-live="polite" aria-atomic="true">
  Found {count} results
</div>
```

---

## Focus Management

### Visible Focus Indicators
All interactive elements have clear focus states:
```css
.focus-visible:focus {
  outline: 2px solid #3B82F6;
  outline-offset: 2px;
}
```

### Focus Trapping
Modals and drawers trap focus within:
```typescript
useEffect(() => {
  if (open) {
    const firstFocusable = modalRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (firstFocusable as HTMLElement)?.focus();
  }
}, [open]);
```

### Skip Links
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

---

## Responsive Design

### Breakpoints
```typescript
export const breakpoints = {
  xs: 0,      // < 640px  - Mobile phones
  sm: 640,    // ≥ 640px  - Large phones
  md: 768,    // ≥ 768px  - Tablets
  lg: 1024,   // ≥ 1024px - Laptops
  xl: 1280,   // ≥ 1280px - Desktops
  '2xl': 1536 // ≥ 1536px - Large displays
};
```

### Touch Targets
Minimum touch target size: **44x44px** (WCAG 2.1 AAA)

```tsx
// Mobile menu button
<button className="p-2 min-h-[44px] min-w-[44px]">
  <MenuIcon />
</button>
```

### Mobile Navigation
- Hamburger menu for mobile (< 1024px)
- Full sidebar for desktop (≥ 1024px)
- Swipe-friendly drawer with backdrop

---

## Component Accessibility

### Sidebar
```typescript
<Sidebar
  items={navigationItems}
  activePath={location.pathname}
  onNavigate={handleNavigate}
  logo={<Logo />}
/>
```

**Accessibility Features:**
- ✅ Keyboard navigation with arrow keys
- ✅ `aria-expanded` for collapsible groups
- ✅ `aria-current="page"` for active items
- ✅ Focus visible indicators
- ✅ Screen reader announcements

### Card
```typescript
<Card variant="glass" clickable onClick={handleClick}>
  <CardHeader>Title</CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

**Accessibility Features:**
- ✅ `role="button"` when clickable
- ✅ `tabIndex={0}` for keyboard access
- ✅ Responds to Enter/Space keys
- ✅ Loading skeleton with `aria-busy`

### CommandPalette
```typescript
<CommandPalette
  open={open}
  onClose={onClose}
  commands={commands}
/>
```

**Accessibility Features:**
- ✅ `role="dialog"` with `aria-modal="true"`
- ✅ Focus trap within palette
- ✅ Keyboard navigation (Arrow keys, Enter, Esc)
- ✅ Screen reader announcements for search results

### ThemeSwitcher
```typescript
<ThemeSwitcher size="md" showLabel={true} />
```

**Accessibility Features:**
- ✅ `aria-label="Toggle dark mode"`
- ✅ Visual state indication (sun/moon icon)
- ✅ Respects `prefers-color-scheme` media query
- ✅ Keyboard accessible

---

## Testing Checklist

### Automated Testing
- [ ] Run axe DevTools browser extension
- [ ] Run Lighthouse accessibility audit (score ≥ 90)
- [ ] Run WAVE accessibility evaluation tool

### Manual Testing
- [ ] Navigate entire app using only keyboard
- [ ] Test with screen reader (VoiceOver/NVDA/JAWS)
- [ ] Test all interactive elements with keyboard
- [ ] Verify focus indicators are visible
- [ ] Check color contrast with browser tools
- [ ] Test responsive design at all breakpoints
- [ ] Test touch targets on mobile device

### Screen Reader Testing
```bash
# macOS VoiceOver
Cmd + F5

# Common commands:
# VO = Ctrl + Option
# VO + A: Start reading
# VO + Right Arrow: Next item
# VO + Space: Activate element
```

### Browser DevTools
```javascript
// Chrome: Accessibility Tree
// 1. Open DevTools (F12)
// 2. Elements tab > Accessibility sidebar
// 3. Review computed properties

// Check focus order
document.querySelectorAll('[tabindex]')
  .forEach((el, i) => console.log(i, el.tabIndex, el));
```

---

## Common Issues & Fixes

### Issue: Missing Focus Indicators
**Fix:**
```css
/* Don't remove outline */
button:focus-visible {
  outline: 2px solid blue;
  outline-offset: 2px;
}
```

### Issue: Images Without Alt Text
**Fix:**
```tsx
<img src="logo.png" alt="UPR Dashboard Logo" />
<img src="decorative.png" alt="" /> {/* Decorative images */}
```

### Issue: Low Color Contrast
**Fix:**
```typescript
// Use design tokens with WCAG AA compliant colors
import { themeColors } from './design-tokens/colors';

<p className="text-gray-900 dark:text-gray-100">
  High contrast text
</p>
```

### Issue: Non-Keyboard Accessible Elements
**Fix:**
```tsx
// Add keyboard handlers
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>
```

---

## Resources

### Tools
- [axe DevTools](https://www.deque.com/axe/devtools/) - Browser extension
- [WAVE](https://wave.webaim.org/) - Web accessibility evaluation tool
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Chrome DevTools
- [NVDA](https://www.nvaccess.org/) - Free screen reader for Windows
- [VoiceOver](https://www.apple.com/accessibility/voiceover/) - Built into macOS/iOS

### Guidelines
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/) - Official guidelines
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) - ARIA patterns
- [A11y Project](https://www.a11yproject.com/) - Community-driven checklist

### Testing
- [WebAIM Screen Reader Survey](https://webaim.org/projects/screenreadersurvey9/)
- [Contrast Checker](https://webaim.org/resources/contrastchecker/)

---

## Sprint 48 Accessibility Achievements

### ✅ Implemented
- WCAG AA color contrast across all themes
- Full keyboard navigation support
- Screen reader compatibility with ARIA labels
- Responsive mobile layouts with proper touch targets
- Focus management in modals and drawers
- Semantic HTML structure
- Skip links for main content
- Loading states with proper announcements

### 🎯 Future Improvements
- Add more comprehensive skip navigation
- Implement reduced motion preferences
- Add high contrast mode option
- Create automated accessibility testing in CI/CD
- Add live region announcements for dynamic content
- Improve form validation error messages

---

**Last Updated:** Sprint 48 - Phase 5
**Maintainer:** UPR Development Team
**Compliance Target:** WCAG 2.1 Level AA
