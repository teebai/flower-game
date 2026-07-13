/**
 * ArtworkPopup.ts — Gallery artwork detail modal (HTML overlay).
 *
 * A warm, low-saturation card shown when a player double-taps an orbiting
 * artwork. Displays the REAL artwork image (loaded from `artwork.imageUrl`,
 * served from `public/artworks/`), the title, year, medium, dimensions, price,
 * and an "Enquire to Buy" button that opens the visitor's mail client with a
 * pre-filled enquiry. If the image file is missing it shows an elegant
 * empty-state placeholder — never a broken image, never the procedural thumb.
 *
 * The popup is a singleton — reuse it via show()/hide(). It appends itself to
 * the game container so it layers above the PixiJS canvas.
 *
 * Styling follows the project's default standards: warm off-white card, soft
 * shadow, clear hierarchy, no saturated gradients.
 */

import type { Artwork } from '../data/artworks';
import { formatPrice } from '../data/artworks';

/** Where purchase enquiries go. Change to the artist's real address. */
const ENQUIRY_EMAIL = 'hello@teebai.flowers';

export class ArtworkPopup {
  /** Backdrop element (semi-transparent, click-to-close). */
  private backdrop: HTMLDivElement;
  /** The card holding content. */
  private card: HTMLDivElement;
  /** Whether the popup is currently visible. */
  private visible = false;

  /** Called when the popup closes (any reason). */
  private onCloseCallback: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    // ── Backdrop ──
    this.backdrop = document.createElement('div');
    Object.assign(this.backdrop.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '10000',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(30, 26, 22, 0.55)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      padding: '20px',
      boxSizing: 'border-box',
      animation: 'teebaiFade 0.18s ease-out',
    });

    // ── Card ──
    this.card = document.createElement('div');
    Object.assign(this.card.style, {
      position: 'relative',
      width: 'min(420px, 100%)',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: '#FFFDF8',
      borderRadius: '16px',
      boxShadow: '0 18px 50px rgba(40,30,20,0.35)',
      padding: '22px',
      boxSizing: 'border-box',
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      color: '#3A322B',
    });

    // Stop backdrop click from closing when clicking inside the card.
    this.card.addEventListener('click', (e) => e.stopPropagation());
    this.backdrop.addEventListener('click', () => this.hide());

    this.backdrop.appendChild(this.card);

    // Ensure parent can anchor the absolutely-positioned overlay.
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    parent.appendChild(this.backdrop);

    this.injectKeyframes();
  }

  /** Inject the fade-in keyframes once. */
  private injectKeyframes(): void {
    if (document.getElementById('teebai-popup-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'teebai-popup-keyframes';
    style.textContent = `
      @keyframes teebaiFade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes teebaiRise {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  // ── Public API ──────────────────────────────────────────────

  /** Show the popup for a given artwork. */
  show(art: Artwork): void {
    this.render(art);
    this.backdrop.style.display = 'flex';
    this.visible = true;
  }

  /** Hide the popup. */
  hide(): void {
    if (!this.visible) return;
    this.backdrop.style.display = 'none';
    this.visible = false;
    this.onCloseCallback?.();
  }

  /** Register a close handler (e.g. to resume gameplay input). */
  onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ── Rendering ───────────────────────────────────────────────

  private render(art: Artwork): void {
    this.card.innerHTML = '';

    // ── Close button ──
    const close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    Object.assign(close.style, {
      position: 'absolute',
      top: '12px',
      right: '14px',
      width: '34px',
      height: '34px',
      border: 'none',
      borderRadius: '50%',
      background: 'rgba(120,100,80,0.12)',
      color: '#6B5D50',
      fontSize: '22px',
      lineHeight: '1',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });
    close.addEventListener('click', () => this.hide());
    close.addEventListener('mouseenter', () => {
      close.style.background = 'rgba(120,100,80,0.22)';
    });
    close.addEventListener('mouseleave', () => {
      close.style.background = 'rgba(120,100,80,0.12)';
    });
    this.card.appendChild(close);

    // ── Artwork image (REAL artwork, loaded from imageUrl) ──
    const imgWrap = document.createElement('div');
    Object.assign(imgWrap.style, {
      width: '100%',
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 6px 18px rgba(60,45,30,0.18)',
      marginBottom: '16px',
      background: '#EFE7DA',
      minHeight: '240px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    const showPlaceholder = () => {
      imgWrap.innerHTML = '';
      const ph = document.createElement('div');
      Object.assign(ph.style, {
        textAlign: 'center',
        color: '#B7A892',
        padding: '24px',
      });
      ph.innerHTML =
        '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="margin:0 auto 10px;display:block;">' +
        '<g fill="#C9B79A">' +
        '<circle cx="20" cy="9" r="5"/><circle cx="20" cy="31" r="5"/>' +
        '<circle cx="9" cy="20" r="5"/><circle cx="31" cy="20" r="5"/>' +
        '<circle cx="11.5" cy="11.5" r="5"/><circle cx="28.5" cy="28.5" r="5"/>' +
        '<circle cx="28.5" cy="11.5" r="5"/><circle cx="11.5" cy="28.5" r="5"/>' +
        '</g><circle cx="20" cy="20" r="6" fill="#9C6B3F"/></svg>' +
        '<div style="font-size:14px;font-weight:600;">Artwork image</div>';
      imgWrap.appendChild(ph);
    };

    if (art.imageUrl) {
      const img = document.createElement('img');
      img.alt = art.title;
      Object.assign(img.style, {
        display: 'block',
        width: '100%',
        height: 'auto',
      });
      img.addEventListener('load', () => { imgWrap.style.minHeight = '0'; });
      img.addEventListener('error', () => {
        // eslint-disable-next-line no-console
        console.warn(`[gallery] Missing artwork image: ${art.imageUrl}`);
        showPlaceholder();
      });
      img.src = art.imageUrl;
      imgWrap.appendChild(img);
    } else {
      showPlaceholder();
    }
    this.card.appendChild(imgWrap);

    // ── Title ──
    const title = document.createElement('h2');
    title.textContent = art.title;
    Object.assign(title.style, {
      margin: '0 0 6px',
      fontSize: '22px',
      fontWeight: '700',
      letterSpacing: '0.2px',
      color: '#2E2721',
    });
    this.card.appendChild(title);

    // ── Meta line: year · medium · dimensions ──
    const meta = document.createElement('div');
    meta.textContent = `${art.year}  ·  ${art.medium}  ·  ${art.dimensions}`;
    Object.assign(meta.style, {
      fontSize: '13.5px',
      color: '#8A7B6C',
      marginBottom: '16px',
      lineHeight: '1.5',
    });
    this.card.appendChild(meta);

    // ── Price ──
    const price = document.createElement('div');
    price.textContent = formatPrice(art);
    Object.assign(price.style, {
      fontSize: '20px',
      fontWeight: '700',
      color: '#9C6B3F',
      marginBottom: '18px',
    });
    this.card.appendChild(price);

    // ── Enquire to Buy button ──
    const buy = document.createElement('button');
    buy.textContent = 'Enquire to Buy';
    Object.assign(buy.style, {
      width: '100%',
      padding: '14px 16px',
      border: 'none',
      borderRadius: '10px',
      background: '#C98A5E',
      color: '#FFFFFF',
      fontSize: '15.5px',
      fontWeight: '600',
      letterSpacing: '0.3px',
      cursor: 'pointer',
      transition: 'background 0.15s ease',
      boxSizing: 'border-box',
    });
    buy.addEventListener('mouseenter', () => { buy.style.background = '#B87A4E'; });
    buy.addEventListener('mouseleave', () => { buy.style.background = '#C98A5E'; });
    buy.addEventListener('click', () => this.openEnquiry(art));
    this.card.appendChild(buy);

    // ── Subtle note ──
    const note = document.createElement('div');
    note.textContent = 'You’ll be taken to your email app to send an enquiry.';
    Object.assign(note.style, {
      fontSize: '12px',
      color: '#B0A392',
      textAlign: 'center',
      marginTop: '10px',
    });
    this.card.appendChild(note);

    // Re-trigger the rise animation.
    this.card.style.animation = 'none';
    // Force reflow so the animation restarts.
    void this.card.offsetWidth;
    this.card.style.animation = 'teebaiRise 0.2s ease-out';
  }

  // ── Enquiry action ──────────────────────────────────────────

  private openEnquiry(art: Artwork): void {
    const subject = encodeURIComponent(`Enquiry: ${art.title} (${art.year})`);
    const body = encodeURIComponent(
      `Hi,\n\nI'm interested in purchasing "${art.title}" ` +
      `(${art.year}, ${art.medium}, ${art.dimensions}).\n\n` +
      `Could you share availability and payment details?\n\nThank you!`,
    );
    window.location.href = `mailto:${ENQUIRY_EMAIL}?subject=${subject}&body=${body}`;
  }

  // ── Cleanup ─────────────────────────────────────────────────

  destroy(): void {
    this.backdrop.remove();
  }
}
