import React, { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

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
    fontSize: '14px',
    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
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
    padding: 20,
    nodeSpacing: 60,
    rankSpacing: 70,
    useMaxWidth: true,
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
                `<img src="${url}" width="24" height="24" style="vertical-align:middle;margin-right:6px;" />`
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
              fill: #F8FAFC !important;
              stroke: #CBD5E1 !important;
              stroke-width: 1.5 !important;
            }
            .architecture-diagram-svg .cluster .nodeLabel,
            .architecture-diagram-svg .cluster-label .nodeLabel {
              font-weight: 600;
              font-size: 12px;
              fill: #64748B;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .architecture-diagram-svg .edgePath .path {
              stroke-width: 1.5;
              stroke: #94A3B8;
            }
            .architecture-diagram-svg .edgePath marker path {
              fill: #94A3B8;
            }
            .architecture-diagram-svg .edgeLabel {
              font-size: 11px;
              background-color: #fff;
              padding: 2px 6px;
              border-radius: 4px;
            }
            .architecture-diagram-svg .nodeLabel {
              font-weight: 500;
              font-size: 13px;
            }
            .architecture-diagram-svg .label foreignObject div {
              display: flex;
              align-items: center;
              justify-content: center;
              line-height: 1.4;
            }
          </style>`;

          enrichedSvg = diagramCSS + enrichedSvg;

          setSvgContent(enrichedSvg);
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
