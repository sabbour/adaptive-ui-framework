import React, { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

// Register ELK layout engine for better node distribution
mermaid.registerLayoutLoaders(elkLayouts);

// Initialize mermaid with a polished, modern look
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    // Node colors
    primaryColor: '#EEF2FF',
    primaryBorderColor: '#818CF8',
    primaryTextColor: '#1E1B4B',
    // Edge colors
    lineColor: '#94A3B8',
    // Group/subgraph colors
    secondaryColor: '#F8FAFC',
    secondaryBorderColor: '#CBD5E1',
    tertiaryColor: '#FFFFFF',
    // Typography
    fontSize: '16px',
    fontFamily: '"Segoe UI", "Segoe UI Semibold", "Segoe UI Light", system-ui, -apple-system, sans-serif',
    // Background
    background: '#FFFFFF',
    mainBkg: '#EEF2FF',
    nodeBorder: '#818CF8',
    clusterBkg: '#F8FAFC',
    clusterBorder: '#CBD5E1',
    titleColor: '#1E293B',
    edgeLabelBackground: '#FFFFFF',
  },
  flowchart: {
    htmlLabels: true,
    curve: 'basis',
    padding: 24,
    nodeSpacing: 80,
    rankSpacing: 90,
    useMaxWidth: false,
    defaultRenderer: 'elk',
  },
  securityLevel: 'loose',
});

/** Icon URL registrations from packs, keyed by logical name (e.g. "azure/aks", "azure/app-service") */
const iconRegistry = new Map<string, string>();

/** Register icon URLs for use in architecture diagrams. Called by packs at init time. */
export function registerDiagramIcons(icons: Record<string, string>) {
  for (const [name, url] of Object.entries(icons)) {
    iconRegistry.set(name.toLowerCase(), url);
  }
}

/** Look up a registered icon URL by logical name */
export function getDiagramIconUrl(name: string): string | undefined {
  return iconRegistry.get(name.toLowerCase());
}

/** Get all registered icon names (for LLM prompt context) */
export function getRegisteredIconNames(): string[] {
  return Array.from(iconRegistry.keys());
}

interface ArchitectureDiagramProps {
  /** Mermaid diagram definition string */
  diagram: string;
  /** Title shown above the diagram */
  title?: string;
}

let diagramCounter = 0;

export function ArchitectureDiagram({ diagram, title }: ArchitectureDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const idRef = useRef(`arch-diagram-${++diagramCounter}`);

  // Pan & zoom state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!diagram || !containerRef.current) return;

    let cancelled = false;

    async function renderDiagram() {
      try {
        setError(null);

        // Post-process diagram: replace icon placeholders like :::icon(azure/aks)
        // with inline image tags for mermaid htmlLabels
        let processedDiagram = diagram;

        // No auto-fixing of Mermaid syntax — the system prompt instructs
        // the correct format. Invalid diagrams will show an error message.

        // Sanitize node labels: escape parentheses inside bracket labels [...]
        // e.g. Storage[Azure Storage (content/images)] → Storage["Azure Storage (content/images)"]
        // Matches any text inside [...] that contains ( but isn't already quoted
        processedDiagram = processedDiagram.replace(
          /\[([^\]"]*\([^\]]*)\]/g,
          (_match, label) => `["${label}"]`
        );

        // Replace node labels that reference icons: e.g. "AKS:::icon-azure-aks"
        // We'll handle this via class-based icon injection after render
        const { svg } = await mermaid.render(idRef.current, processedDiagram);

        if (!cancelled) {
          // Inject icon images into nodes that have icon data attributes
          let enrichedSvg = svg;

          // Replace %%icon:name%% comments in labels with actual <img> tags
          iconRegistry.forEach((url, name) => {
            const placeholder = `%%icon:${name}%%`;
            if (enrichedSvg.includes(placeholder)) {
              enrichedSvg = enrichedSvg.split(placeholder).join(
                `<img src="${url}" width="28" height="28" style="vertical-align:middle;margin-right:8px;flex-shrink:0;" />`
              );
            }
          });

          // Inject CSS for polished SVG appearance
          const diagramCSS = `<style>
            .architecture-diagram-svg svg {
              max-width: 100%;
              height: auto;
            }
            .architecture-diagram-svg .node rect,
            .architecture-diagram-svg .node circle,
            .architecture-diagram-svg .node polygon {
              rx: 8;
              ry: 8;
              filter: drop-shadow(0 1px 2px rgba(0,0,0,0.06));
              stroke-width: 1.5;
            }
            .architecture-diagram-svg .cluster rect {
              rx: 12 !important;
              ry: 12 !important;
              stroke-dasharray: none !important;
              fill: #F1F5F9 !important;
              stroke: #94A3B8 !important;
              stroke-width: 2 !important;
            }
            .architecture-diagram-svg .cluster .nodeLabel,
            .architecture-diagram-svg .cluster-label .nodeLabel,
            .architecture-diagram-svg .cluster-label span,
            .architecture-diagram-svg .cluster-label p,
            .architecture-diagram-svg .cluster-label div,
            .architecture-diagram-svg [class*="cluster"] .label span,
            .architecture-diagram-svg [class*="cluster"] .label div {
              font-family: 'Segoe UI Semibold', 'Segoe UI', system-ui, sans-serif !important;
              font-weight: 700 !important;
              font-size: 14px !important;
              fill: #1E293B !important;
              color: #1E293B !important;
              text-transform: uppercase !important;
              letter-spacing: 0.08em !important;
              visibility: visible !important;
              opacity: 1 !important;
              background: #E2E8F0 !important;
              padding: 4px 12px !important;
              border-radius: 6px !important;
            }
            .architecture-diagram-svg .cluster-label {
              visibility: visible !important;
              opacity: 1 !important;
              overflow: visible !important;
            }
            .architecture-diagram-svg .cluster-label foreignObject {
              overflow: visible !important;
            }
            .architecture-diagram-svg .cluster-label foreignObject div {
              overflow: visible !important;
              white-space: nowrap !important;
              width: auto !important;
            }
            .architecture-diagram-svg .edgePath .path {
              stroke-width: 1.5;
              stroke: #94A3B8;
            }
            .architecture-diagram-svg .edgePath marker path {
              fill: #94A3B8;
            }
            .architecture-diagram-svg .edgeLabel {
              font-family: 'Segoe UI Light', 'Segoe UI', system-ui, sans-serif;
              font-size: 13px;
              background-color: #fff;
              padding: 2px 6px;
              border-radius: 4px;
            }
            .architecture-diagram-svg .nodeLabel {
              font-family: 'Segoe UI', system-ui, sans-serif;
              font-weight: 500;
              text-align: center;
            }
            .architecture-diagram-svg .label foreignObject div {
              display: flex;
              align-items: center;
              justify-content: center;
              text-align: center;
              line-height: 1.3;
              gap: 0;
            }
            .architecture-diagram-svg .label foreignObject div img {
              flex-shrink: 0;
            }
            .architecture-diagram-svg .label foreignObject {
              text-align: center;
            }
            .architecture-diagram-svg .node .label {
              text-align: center;
            }
          </style>`;

          enrichedSvg = diagramCSS + enrichedSvg;

          setSvgContent(enrichedSvg);

          // Auto-fit: calculate scale to fit the diagram in the container
          requestAnimationFrame(() => {
            if (!containerRef.current) return;
            // Force cluster labels visible (ELK renderer sometimes hides them)
            const clusterLabels = containerRef.current.querySelectorAll('.cluster-label, [class*="cluster"] .label');
            // Replace broken foreignObject labels with clean SVG text
            const diagramSvg = containerRef.current.querySelector('svg');
            if (diagramSvg) {
              const clusters = diagramSvg.querySelectorAll('g.cluster, g[class*="cluster"]');
              clusters.forEach((cluster) => {
                const rect = cluster.querySelector(':scope > rect');
                const labelEl = cluster.querySelector('.cluster-label');
                if (!rect || !labelEl) return;

                // Extract text content
                const text = (labelEl.textContent || '').trim();
                if (!text) return;

                // Get rect position
                const rx = parseFloat(rect.getAttribute('x') || '0');
                const ry = parseFloat(rect.getAttribute('y') || '0');
                const rw = parseFloat(rect.getAttribute('width') || '0');

                // Hide the original broken label
                (labelEl as HTMLElement).style.display = 'none';

                // Create a new SVG text element centered at top of rect
                const svgText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                svgText.setAttribute('x', String(rx + rw / 2));
                svgText.setAttribute('y', String(ry + 20));
                svgText.setAttribute('text-anchor', 'middle');
                svgText.setAttribute('dominant-baseline', 'middle');
                svgText.setAttribute('font-family', "'Segoe UI Semibold', 'Segoe UI', system-ui, sans-serif");
                svgText.setAttribute('font-weight', '700');
                svgText.setAttribute('font-size', '14');
                svgText.setAttribute('fill', '#1E293B');
                svgText.setAttribute('letter-spacing', '0.08em');
                svgText.textContent = text.toUpperCase();

                // Add a background rect behind the text
                const bbox = { width: text.length * 9 + 24, height: 24 }; // estimate
                const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bgRect.setAttribute('x', String(rx + rw / 2 - bbox.width / 2));
                bgRect.setAttribute('y', String(ry + 20 - bbox.height / 2));
                bgRect.setAttribute('width', String(bbox.width));
                bgRect.setAttribute('height', String(bbox.height));
                bgRect.setAttribute('rx', '6');
                bgRect.setAttribute('fill', '#E2E8F0');
                bgRect.setAttribute('stroke', '#CBD5E1');
                bgRect.setAttribute('stroke-width', '1');

                cluster.appendChild(bgRect);
                cluster.appendChild(svgText);
              });
            }
            const containerRect = containerRef.current.getBoundingClientRect();
            const svgEl = containerRef.current.querySelector('svg');
            if (!svgEl) return;
            const svgWidth = svgEl.getAttribute('width') ? parseFloat(svgEl.getAttribute('width')!) : svgEl.getBoundingClientRect().width;
            const svgHeight = svgEl.getAttribute('height') ? parseFloat(svgEl.getAttribute('height')!) : svgEl.getBoundingClientRect().height;
            if (svgWidth > 0 && svgHeight > 0) {
              const padding = 48;
              const availW = containerRect.width - padding;
              const availH = containerRect.height - padding;
              // Never upscale above 1x; upscaling makes the initial small diagram
              // appear much larger than later, denser diagrams.
              const fitScale = Math.min(availW / svgWidth, availH / svgHeight, 1);
              if (fitScale > 0 && fitScale < 10) {
                setScale(fitScale);
                setTranslate({ x: 0, y: 0 });
              }
            }
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Failed to render diagram');
        }
      }
    }

    renderDiagram();
    return () => { cancelled = true; };
  }, [diagram]);

  // Wheel zoom — use native listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(prev => Math.min(Math.max(prev * delta, 0.2), 5));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
    (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
  }, [translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setTranslate({
      x: translateStart.current.x + (e.clientX - panStart.current.x),
      y: translateStart.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    isPanning.current = false;
    (e.currentTarget as HTMLElement).style.cursor = 'grab';
  }, []);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#FAFBFC',
      borderRight: '1px solid var(--adaptive-border, #E2E8F0)',
    } as React.CSSProperties,
  },
    // Title bar
    React.createElement('div', {
      style: {
        padding: '14px 20px',
        borderBottom: '1px solid var(--adaptive-border, #E2E8F0)',
        fontSize: '13px',
        fontWeight: 600,
        color: '#1E293B',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
        backgroundColor: '#FFFFFF',
        letterSpacing: '0.01em',
        justifyContent: 'space-between',
      } as React.CSSProperties,
    },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('span', { style: { fontSize: '16px' } }, '🏗️'),
        title || 'Solution Architecture'
      ),
      // Zoom controls
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '4px' } as React.CSSProperties,
      },
        React.createElement('button', {
          onClick: () => setScale(s => Math.max(s * 0.8, 0.2)),
          title: 'Zoom out',
          style: {
            width: '28px', height: '28px', border: '1px solid #E2E8F0',
            borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer',
            fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B',
          },
        }, '−'),
        React.createElement('span', {
          style: { fontSize: '11px', color: '#94A3B8', fontFamily: 'monospace', minWidth: '36px', textAlign: 'center' as const },
        }, `${Math.round(scale * 100)}%`),
        React.createElement('button', {
          onClick: () => setScale(s => Math.min(s * 1.2, 5)),
          title: 'Zoom in',
          style: {
            width: '28px', height: '28px', border: '1px solid #E2E8F0',
            borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer',
            fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B',
          },
        }, '+'),
        React.createElement('button', {
          onClick: resetView,
          title: 'Reset view',
          style: {
            width: '28px', height: '28px', border: '1px solid #E2E8F0',
            borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer',
            fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748B', marginLeft: '4px',
          },
        }, '⟲')
      )
    ),

    // Diagram area (pannable + zoomable)
    React.createElement('div', {
      ref: containerRef,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      style: {
        flex: 1,
        overflow: 'hidden',
        padding: '24px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        cursor: 'grab',
        userSelect: 'none',
      } as React.CSSProperties,
    },
      error
        ? React.createElement('div', {
            style: {
              padding: '16px 20px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '10px',
              fontSize: '12px',
              color: '#991B1B',
              maxWidth: '360px',
              lineHeight: 1.5,
            },
          }, 'Diagram error: ', error)
        : svgContent
          ? React.createElement('div', {
              style: {
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
              } as React.CSSProperties,
            },
              React.createElement('div', {
                dangerouslySetInnerHTML: { __html: svgContent },
                className: 'architecture-diagram-svg',
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  minHeight: '200px',
                  padding: '16px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
                },
              })
            )
          : React.createElement('div', {
              style: {
                color: 'var(--adaptive-text-secondary, #6b7280)',
                fontSize: '13px',
                textAlign: 'center',
                padding: '40px',
              } as React.CSSProperties,
            },
              React.createElement('div', {
                style: { fontSize: '32px', marginBottom: '12px' },
              }, '📐'),
              'Architecture diagram will appear here as you design your solution.'
            )
    )
  );
}
