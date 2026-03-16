import React from 'react';
import type { AdaptiveNode, AdaptiveValue } from './schema';
import { getComponent } from './registry';
import { useAdaptive } from './context';
import { resolveValue, interpolateDeep } from './interpolation';

// ─── Recursive Renderer ───
// Takes an AdaptiveNode tree and renders it using registered components.

interface RendererProps {
  node: AdaptiveNode;
  itemContext?: Record<string, AdaptiveValue>;
  itemIndex?: number;
}

export function AdaptiveRenderer({ node, itemContext, itemIndex }: RendererProps): React.ReactElement | null {
  const { state } = useAdaptive();

  // Guard against undefined/null node
  if (!node) return null;

  // Visibility check
  const visible = resolveValue(node.visible, state, true);
  if (!visible) return null;

  // Interpolate all string values in the node for dynamic content
  const resolved = interpolateDeep(node, state, itemContext, itemIndex);

  // Look up the component from the registry
  const Component = getComponent(resolved.type);

  if (!Component) {
    if (import.meta.env.DEV) {
      return React.createElement('div', {
        style: { color: 'red', border: '1px solid red', padding: '8px', margin: '4px', fontSize: '12px' },
        children: `Unknown component type: "${resolved.type}"`,
      });
    }
    return null;
  }

  return React.createElement(Component, { node: resolved, key: resolved.id });
}

/** Render an array of child nodes */
export function renderChildren(
  children: AdaptiveNode[] | undefined,
  itemContext?: Record<string, AdaptiveValue>,
  itemIndex?: number
): React.ReactElement[] {
  if (!children) return [];
  return children.map((child, i) =>
    React.createElement(AdaptiveRenderer, {
      key: child.id ?? `child-${i}`,
      node: child,
      itemContext,
      itemIndex,
    })
  );
}
