/**
 * ArtworkPopup.ts — Gallery artwork detail modal, styled as a PoE2 item card.
 *
 * The detail view is presented like an item tooltip from Path of Exile 2:
 * a dark engraved card with a gold small-caps header ribbon, the medium as
 * the "base type", white base stats (Item Level = year, dimensions), blue
 * "mods" (each artwork's flavour stats), ornamented dividers, and an italic
 * flavour-text block carrying the STORY behind the piece. The real artwork
 * image (loaded from `artwork.imageUrl`, served from `public/artworks/`) sits
 * at the top. The card body scrolls when the story is long; the Enquire
 * button and ‹ › navigation stay pinned.
 *
 * HD ZOOM: clicking the artwork image opens a fullscreen PhotoSwipe lightbox
 * (pinch / wheel / double-tap zoom, drag-to-pan, swipe / arrow navigation).
 * The heavy PhotoSwipe core is dynamically imported on first zoom, so it adds
 * nothing to the main game bundle.
 *
 * The popup is a singleton — reuse it via show()/hide(). It appends itself to
 * the game container so it layers above the PixiJS canvas.
 */

import type { Artwork } from '../data/artworks';
import { formatPrice } from '../data/artworks';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

/** Where purchase enquiries go. Change to the artist's real address. */
const ENQUIRY_EMAIL = 'hello@teebai.flowers';

/** Engraved serif stack approximating PoE's "Fontin" item font. */
const POE_FONT =
  "'Palatino Linotype', Palatino, 'Book Antiqua', 'Hoefler Text', Georgia, serif";

/** PoE-style colour tokens (low-saturation dark card + gold/blue accents). */
const POE = {
  nameUnique: '#d9a25c', // burnt-gold unique name
  typeLine: '#a99a86', // muted base-type line
  statWhite: '#e8e2d4', // base stats
  modBlue: '#8d93e6', // magic-mod blue
  valueGold: '#e0b765', // price line
  flavor: '#b29a77', // italic flavour/story text
  divider: 'rgba(120,100,70,0.55)',
  diamond: 'rgba(224,183,101,0.6)',
  panelBg: '#17120d', // mid card tone (used to mask divider under the diamond)
} as const;

export class ArtworkPopup {
  /** Backdrop element (semi-transparent, click-to-close). */
  private backdrop: HTMLDivElement;
  /** The card holding content. */
  private card: HTMLDivElement;
  /** Whether the popup is currently visible. */
  private visible = false;

  /** Called when the popup closes (any reason). */
  private onCloseCallback: (() => void) | null = null;

  /** Ordered list of artworks for prev/next navigation. */
  private collection: Artwork[] = [];

  /** Index of the currently shown artwork within `collection`. */
  private currentIndex = -1;

  /** Keydown handler ref (Arrow keys / Escape) so we can detach it. */
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** Lazily-created PhotoSwipe lightbox (HD zoom). */
  private lightbox: PhotoSwipeLightbox | null = null;

  /** True while the HD zoom lightbox is open (suppresses popup hotkeys). */
  private zoomOpen = false;

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
      background: 'rgba(20, 16, 12, 0.62)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      padding: '20px',
      boxSizing: 'border-box',
      animation: 'teebaiFade 0.18s ease-out',
    });

    // ── Card (dark PoE item frame; flex column so the body can scroll) ──
    this.card = document.createElement('div');
    Object.assign(this.card.style, {
      position: 'relative',
      width: 'min(460px, 100%)',
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden', // the inner body scrolls, the card frame does not
      background: 'linear-gradient(180deg, #1d1711 0%, #100c08 100%)',
      border: '1px solid #4a4038',
      borderRadius: '14px',
      boxShadow:
        '0 22px 60px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(224,183,101,0.08)',
      padding: '0',
      boxSizing: 'border-box',
      color: POE.statWhite,
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
      /* Slim, themed scrollbar for the item body */
      .teebai-itembody::-webkit-scrollbar { width: 8px; }
      .teebai-itembody::-webkit-scrollbar-track { background: transparent; }
      .teebai-itembody::-webkit-scrollbar-thumb {
        background: rgba(224,183,101,0.28);
        border-radius: 8px;
      }
      .teebai-itembody::-webkit-scrollbar-thumb:hover {
        background: rgba(224,183,101,0.45);
      }
    `;
    document.head.appendChild(style);
  }

  // ── Public API ──────────────────────────────────────────────

  /** Show the popup for a given artwork. */
  show(art: Artwork): void {
    this.currentIndex = this.collection.findIndex((a) => a.id === art.id);
    this.render(art);
    this.backdrop.style.display = 'flex';
    this.visible = true;
    this.attachKeyboard();
  }

  /** Hide the popup. */
  hide(): void {
    if (!this.visible) return;
    this.backdrop.style.display = 'none';
    this.visible = false;
    this.detachKeyboard();
    this.onCloseCallback?.();
  }

  /** Register a close handler (e.g. to resume gameplay input). */
  onClose(cb: () => void): void {
    this.onCloseCallback = cb;
  }

  /** Provide the ordered artwork list to enable prev/next navigation. */
  setCollection(artworks: Artwork[]): void {
    this.collection = artworks;
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ── Navigation ──────────────────────────────────────────────

  /** Step to the previous (-1) or next (+1) artwork, wrapping around. */
  private navigate(dir: -1 | 1): void {
    if (this.collection.length < 2 || this.currentIndex < 0) return;
    const n = this.collection.length;
    const next = (this.currentIndex + dir + n) % n;
    this.show(this.collection[next]);
  }

  /** ArrowLeft/ArrowRight navigate, Escape closes — active while visible. */
  private attachKeyboard(): void {
    if (this.keyHandler) return;
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.visible) return;
      if (this.zoomOpen) return; // let PhotoSwipe own the keyboard while zooming
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.navigate(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.navigate(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private detachKeyboard(): void {
    if (!this.keyHandler) return;
    window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }

  // ── HD zoom (PhotoSwipe) ────────────────────────────────────

  /**
   * Build (once) the fullscreen zoom lightbox. The heavy PhotoSwipe core is
   * pulled in via dynamic import() on first use, so it never touches the main
   * game bundle. The whole collection becomes a swipeable/arrow-navigable
   * gallery; HD files (art.hdUrl) are fetched only when a slide opens.
   */
  private ensureLightbox(): PhotoSwipeLightbox {
    if (this.lightbox) return this.lightbox;

    const dataSource = this.collection.map((art) => ({
      src: art.hdUrl || art.imageUrl || '',
      width: art.hdWidth ?? art.width,
      height: art.hdHeight ?? art.height,
      msrc: art.imageUrl, // crisp 900px thumb shown while the HD file streams in
      alt: art.title,
    }));

    const lb = new PhotoSwipeLightbox({
      dataSource,
      pswpModule: () => import('photoswipe'),
      // ── Tuned for inspecting fine artwork detail ──
      bgOpacity: 0.94,
      showHideAnimationType: 'zoom',
      wheelToZoom: true, // desktop: plain wheel zooms (no Ctrl needed)
      imageClickAction: 'zoom', // click the image to zoom in further
      tapAction: 'toggle-controls', // mobile: tap toggles the UI
      padding: { top: 20, bottom: 20, left: 20, right: 20 },
    });

    // Track open/close so the popup's own hotkeys don't fight PhotoSwipe's.
    lb.on('close', () => {
      this.zoomOpen = false;
    });

    lb.init();
    this.lightbox = lb;
    return lb;
  }

  /** Open the fullscreen HD zoom, focused on the current artwork. */
  private openZoom(): void {
    const idx = this.currentIndex >= 0 ? this.currentIndex : 0;
    this.zoomOpen = true;
    this.ensureLightbox().loadAndOpen(idx);
  }

  // ── Rendering ───────────────────────────────────────────────

  private render(art: Artwork): void {
    this.card.innerHTML = '';

    // ── Close button (dark-theme) ──
    const close = document.createElement('button');
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    Object.assign(close.style, {
      position: 'absolute',
      top: '10px',
      right: '12px',
      width: '32px',
      height: '32px',
      border: 'none',
      borderRadius: '50%',
      background: 'rgba(255,245,230,0.10)',
      color: '#d8cdba',
      fontSize: '20px',
      lineHeight: '1',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '3',
    });
    close.addEventListener('click', () => this.hide());
    close.addEventListener('mouseenter', () => {
      close.style.background = 'rgba(255,245,230,0.22)';
    });
    close.addEventListener('mouseleave', () => {
      close.style.background = 'rgba(255,245,230,0.10)';
    });
    this.card.appendChild(close);

    // ── Scrollable item body ──
    const body = document.createElement('div');
    body.className = 'teebai-itembody';
    Object.assign(body.style, {
      flex: '1 1 auto',
      minHeight: '0',
      overflowY: 'auto',
      padding: '18px 22px 6px',
    });

    // ── Artwork image (REAL artwork, loaded from imageUrl) ──
    const imgWrap = document.createElement('div');
    Object.assign(imgWrap.style, {
      position: 'relative',
      width: '100%',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: 'inset 0 0 0 1px #3a3028, 0 8px 22px rgba(0,0,0,0.5)',
      marginBottom: '16px',
      background: '#241d16',
      minHeight: '220px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    const showPlaceholder = () => {
      imgWrap.innerHTML = '';
      const ph = document.createElement('div');
      Object.assign(ph.style, {
        textAlign: 'center',
        color: '#a99c80',
        padding: '24px',
      });
      ph.innerHTML =
        '<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="margin:0 auto 10px;display:block;">' +
        '<g fill="#6f5f48">' +
        '<circle cx="20" cy="9" r="5"/><circle cx="20" cy="31" r="5"/>' +
        '<circle cx="9" cy="20" r="5"/><circle cx="31" cy="20" r="5"/>' +
        '<circle cx="11.5" cy="11.5" r="5"/><circle cx="28.5" cy="28.5" r="5"/>' +
        '<circle cx="28.5" cy="11.5" r="5"/><circle cx="11.5" cy="28.5" r="5"/>' +
        '</g><circle cx="20" cy="20" r="6" fill="#c9a06a"/></svg>' +
        '<div style="font-size:13px;font-weight:600;letter-spacing:0.4px;">Artwork image</div>';
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
      img.addEventListener('load', () => {
        imgWrap.style.minHeight = '0';
      });
      img.addEventListener('error', () => {
        // eslint-disable-next-line no-console
        console.warn(`[gallery] Missing artwork image: ${art.imageUrl}`);
        showPlaceholder();
      });
      img.src = art.imageUrl;
      imgWrap.appendChild(img);

      // Make the artwork zoomable — click opens the fullscreen HD lightbox.
      imgWrap.style.cursor = 'zoom-in';
      imgWrap.appendChild(this.zoomBadge());
      imgWrap.addEventListener('click', () => this.openZoom());
    } else {
      showPlaceholder();
    }
    body.appendChild(imgWrap);

    // ── Header ribbon: name (gold, small-caps) + medium (base type) ──
    const header = document.createElement('div');
    Object.assign(header.style, {
      textAlign: 'center',
      padding: '4px 8px 8px',
      background:
        'radial-gradient(ellipse at center, rgba(224,183,101,0.10) 0%, transparent 70%)',
    });
    const name = document.createElement('div');
    name.textContent = art.title;
    Object.assign(name.style, {
      fontFamily: POE_FONT,
      fontVariant: 'small-caps',
      fontSize: '24px',
      fontWeight: '600',
      letterSpacing: '1.5px',
      color: POE.nameUnique,
      lineHeight: '1.2',
      textShadow: '0 1px 2px rgba(0,0,0,0.6)',
    });
    header.appendChild(name);
    const typeLine = document.createElement('div');
    typeLine.textContent = art.medium;
    Object.assign(typeLine.style, {
      fontFamily: POE_FONT,
      fontVariant: 'small-caps',
      fontSize: '13px',
      letterSpacing: '1px',
      color: POE.typeLine,
      marginTop: '3px',
    });
    header.appendChild(typeLine);
    body.appendChild(header);

    // ── Base stats (white): Item Level (year) + dimensions ──
    body.appendChild(this.divider());
    const base = document.createElement('div');
    Object.assign(base.style, { padding: '4px 0' });
    base.appendChild(this.statLine(`Item Level: ${art.year}`, POE.statWhite));
    base.appendChild(this.statLine(art.dimensions, POE.statWhite));
    body.appendChild(base);

    // ── Mods (blue) + value (gold) ──
    body.appendChild(this.divider());
    const mods = document.createElement('div');
    Object.assign(mods.style, { padding: '4px 0' });
    (art.flavorMods ?? []).forEach((m) => {
      mods.appendChild(this.statLine(m, POE.modBlue));
    });
    mods.appendChild(
      this.statLine(`Value: ${formatPrice(art)}`, POE.valueGold, {
        fontWeight: '600',
        marginTop: '4px',
      }),
    );
    body.appendChild(mods);

    // ── Flavour story (italic) ──
    body.appendChild(this.divider());
    const story = document.createElement('div');
    story.textContent = art.story ?? '';
    Object.assign(story.style, {
      fontFamily: POE_FONT,
      fontStyle: 'italic',
      fontSize: '14.5px',
      lineHeight: '1.6',
      color: POE.flavor,
      textAlign: 'center',
      padding: '6px 6px 10px',
    });
    body.appendChild(story);

    this.card.appendChild(body);

    // ── Fixed footer: Enquire to Buy + note ──
    const footer = document.createElement('div');
    Object.assign(footer.style, {
      flex: '0 0 auto',
      padding: '12px 22px 18px',
      borderTop: '1px solid rgba(224,183,101,0.12)',
    });

    const buy = document.createElement('button');
    buy.textContent = 'Enquire to Buy';
    Object.assign(buy.style, {
      width: '100%',
      padding: '13px 16px',
      border: '1px solid #C98A5E',
      borderRadius: '9px',
      background: 'linear-gradient(180deg, #C98A5E 0%, #b87a4e 100%)',
      color: '#FFFFFF',
      fontSize: '15.5px',
      fontWeight: '600',
      letterSpacing: '0.4px',
      cursor: 'pointer',
      transition: 'filter 0.15s ease',
      boxSizing: 'border-box',
    });
    buy.addEventListener('mouseenter', () => {
      buy.style.filter = 'brightness(1.08)';
    });
    buy.addEventListener('mouseleave', () => {
      buy.style.filter = 'none';
    });
    buy.addEventListener('click', () => this.openEnquiry(art));
    footer.appendChild(buy);

    const note = document.createElement('div');
    note.textContent = 'You’ll be taken to your email app to send an enquiry.';
    Object.assign(note.style, {
      fontSize: '11.5px',
      color: '#7d6f5c',
      textAlign: 'center',
      marginTop: '9px',
    });
    footer.appendChild(note);

    this.card.appendChild(footer);

    // Re-trigger the rise animation.
    this.card.style.animation = 'none';
    void this.card.offsetWidth; // force reflow so the animation restarts
    this.card.style.animation = 'teebaiRise 0.2s ease-out';

    // Prev/next artwork navigation (only when a collection is set).
    this.appendNavButtons();
  }

  // ── Small builders ──────────────────────────────────────────

  /** A centred ornament divider: a fading line with a tiny gold diamond. */
  private divider(): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      position: 'relative',
      height: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '2px 0',
    });
    const line = document.createElement('div');
    Object.assign(line.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: '50%',
      height: '1px',
      background: `linear-gradient(90deg, transparent, ${POE.divider}, transparent)`,
      transform: 'translateY(-50%)',
    });
    const diamond = document.createElement('div');
    diamond.textContent = '◆';
    Object.assign(diamond.style, {
      position: 'relative',
      color: POE.diamond,
      fontSize: '8px',
      padding: '0 7px',
      background: POE.panelBg, // masks the line behind the diamond
    });
    wrap.appendChild(line);
    wrap.appendChild(diamond);
    return wrap;
  }

  /** A single centred serif stat line. */
  private statLine(
    text: string,
    color: string,
    extra?: Record<string, string>,
  ): HTMLElement {
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, {
      textAlign: 'center',
      fontFamily: POE_FONT,
      color,
      fontSize: '15px',
      lineHeight: '1.55',
      letterSpacing: '0.3px',
      ...(extra ?? {}),
    });
    return el;
  }

  /** A small "Zoom" magnifier badge overlaid on the artwork image. */
  private zoomBadge(): HTMLElement {
    const badge = document.createElement('div');
    Object.assign(badge.style, {
      position: 'absolute',
      right: '10px',
      bottom: '10px',
      display: 'flex',
      alignItems: 'center',
      gap: '5px',
      padding: '6px 10px',
      borderRadius: '20px',
      background: 'rgba(16,12,8,0.72)',
      color: '#e8e2d4',
      fontSize: '12px',
      fontFamily: POE_FONT,
      letterSpacing: '0.4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
      pointerEvents: 'none', // the image wrapper handles the click
    });
    badge.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="11" cy="11" r="7" stroke="#e0b765" stroke-width="2"/>' +
      '<line x1="16.5" y1="16.5" x2="21" y2="21" stroke="#e0b765" stroke-width="2" stroke-linecap="round"/>' +
      '<line x1="11" y1="8" x2="11" y2="14" stroke="#e0b765" stroke-width="2" stroke-linecap="round"/>' +
      '<line x1="8" y1="11" x2="14" y2="11" stroke="#e0b765" stroke-width="2" stroke-linecap="round"/>' +
      '</svg><span>Zoom</span>';
    return badge;
  }

  // ── Nav buttons ─────────────────────────────────────────────

  /** Circular ‹ › buttons pinned to the card edges (vertically centred). */
  private appendNavButtons(): void {
    if (this.collection.length < 2) return;

    const makeBtn = (dir: -1 | 1): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = dir < 0 ? '‹' : '›';
      b.setAttribute('aria-label', dir < 0 ? 'Previous artwork' : 'Next artwork');
      Object.assign(b.style, {
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        ...(dir < 0 ? { left: '-19px' } : { right: '-19px' }),
        width: '42px',
        height: '42px',
        border: '1px solid #4a4038',
        borderRadius: '50%',
        background: '#1d1711',
        color: POE.valueGold,
        fontSize: '26px',
        lineHeight: '1',
        paddingBottom: '3px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        zIndex: '4',
      });
      b.addEventListener('mouseenter', () => {
        b.style.background = '#2a221a';
      });
      b.addEventListener('mouseleave', () => {
        b.style.background = '#1d1711';
      });
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // never reach the backdrop's click-to-close
        this.navigate(dir);
      });
      return b;
    };

    this.card.appendChild(makeBtn(-1));
    this.card.appendChild(makeBtn(1));
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
    this.detachKeyboard();
    this.lightbox?.destroy();
    this.lightbox = null;
    this.backdrop.remove();
  }
}
