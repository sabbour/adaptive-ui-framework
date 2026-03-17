import React from 'react';
import type { AdaptiveNode, AdaptiveValue } from './schema';
import { getComponent } from './registry';
import { useAdaptive } from './context';
import { resolveValue, interpolateDeep } from './interpolation';
import { logDecision } from './decision-log';

// ─── Recursive Renderer ───
// Takes an AdaptiveNode tree and renders it using registered components.

interface RendererProps {
  node: AdaptiveNode;
  itemContext?: Record<string, AdaptiveValue>;
  itemIndex?: number;
}

function inferFallbackNode(node: any): AdaptiveNode | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node.tabs)) {
    return {
      type: 'tabs',
      tabs: node.tabs,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (Array.isArray(node.children)) {
    return {
      type: 'container',
      children: node.children,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (Array.isArray(node.options) && (node.bind || node.key)) {
    return {
      type: node.options.length <= 5 ? 'radioGroup' : 'select',
      label: node.label,
      options: node.options,
      bind: node.bind ?? node.key,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (Array.isArray(node.rows) && Array.isArray(node.columns)) {
    return {
      type: 'table',
      columns: node.columns,
      rows: node.rows,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (node.rows && node.columns) {
    return {
      type: 'table',
      columns: node.columns,
      rows: node.rows,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (node.items && node.itemTemplate) {
    return {
      type: 'list',
      items: node.items,
      itemTemplate: node.itemTemplate,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (typeof node.code === 'string') {
    return {
      type: 'codeBlock',
      code: node.code,
      language: node.language,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (typeof node.content === 'string') {
    return {
      type: 'text',
      content: node.content,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  if (node.bind || node.key) {
    return {
      type: 'input',
      inputType: node.inputType,
      label: node.label,
      placeholder: node.placeholder,
      bind: node.bind ?? node.key,
      style: node.style,
      className: node.className,
    } as AdaptiveNode;
  }

  return null;
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

  // Handle { type: "component", component: "actualName" } wrapper pattern
  // This occurs when the LLM uses the intent ask format in Adaptive mode or in show items
  if (resolved.type === 'component' && (resolved as any).component) {
    const compName = (resolved as any).component;
    const { type: _t, component: _c, props: compProps, ...rest } = resolved as any;
    const unwrapped = { type: compName, ...(compProps || {}), ...rest } as AdaptiveNode;
    logDecision('renderer', `Unwrapped { type: "component", component: "${compName}" } into direct component render`);
    return React.createElement(AdaptiveRenderer, { node: unwrapped, key: resolved.id });
  }

  // Look up the component from the registry
  const Component = getComponent(resolved.type);

  if (!Component) {
    const fallbackNode = inferFallbackNode(resolved);
    if (fallbackNode && fallbackNode.type !== resolved.type) {
      logDecision('renderer', `No registered component for "${resolved.type}" — inferred it looks like a "${fallbackNode.type}" based on its props (${Object.keys(resolved).filter(k => k !== 'type' && k !== 'style' && k !== 'className').join(', ')})`);
      return React.createElement(AdaptiveRenderer, { node: fallbackNode, key: resolved.id });
    }
    logDecision('renderer', `No registered component for "${resolved.type}" and could not infer a fallback from its props — rendering a placeholder`);
    if (import.meta.env.DEV) {
      return React.createElement('div', {
        style: { color: 'red', border: '1px solid red', padding: '8px', margin: '4px', fontSize: '12px' },
        children: `Unknown component type: "${resolved.type}"`,
      });
    }
    return React.createElement('div', {
      style: {
        padding: '8px 10px', margin: '4px 0', fontSize: '12px',
        borderRadius: '6px', border: '1px dashed #d1d5db', color: '#6b7280',
      },
      children: `Unsupported component: ${resolved.type}`,
    });
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
