// ─── Compact Notation ───
// LLM always outputs compact JSON. Client always expands before rendering.
// ~40% token savings on output.

const KEY_MAP: Record<string, string> = {
  v: 'version', tt: 'title', m: 'agentMessage', ly: 'layout',
  st: 'state', th: 'theme',
  t: 'type', ch: 'children', s: 'style', cn: 'className',
  p: 'props', vis: 'visible',
  c: 'content', vr: 'variant',
  b: 'bind', l: 'label', ph: 'placeholder', it: 'inputType',
  o: 'options', d: 'description', req: 'required',
  lb: 'label', oc: 'onClick', os: 'onSubmit', dis: 'disabled',
  ev: 'enumValues', val: 'value',
  src: 'src', alt: 'alt', sub: 'subtitle',
  cols: 'columns', rows: 'rows', hd: 'header', k: 'key', w: 'width',
  items: 'items', tmpl: 'itemTemplate',
  tabs: 'tabs', id: 'id', max: 'max',
  sev: 'severity',
  pr: 'prompt', tgt: 'target', nm: 'name', pl: 'payload',
  mn: 'min', mx: 'max', stp: 'step',
  clr: 'color', code: 'code', lang: 'language',
  href: 'href', ext: 'external',
  szs: 'sizes', gp: 'gap',
  rt: 'resourceType',
  pc: 'primaryColor', bg: 'backgroundColor',
  sc: 'surfaceColor', tc: 'textColor',
  br: 'borderRadius', ff: 'fontFamily',
  // Intent keys
  msg: 'message', ask: 'ask', sh: 'show', nx: 'next',
  mul: 'multiple', comp: 'component',
  q: 'questions', qs: 'questions', onC: 'onComplete',
  fp: 'freeformPlaceholder',
};

const TYPE_MAP: Record<string, string> = {
  tx: 'text', btn: 'button', inp: 'input', sel: 'select', img: 'image',
  ctr: 'container', clm: 'columns', crd: 'card', lst: 'list', tbl: 'table', frm: 'form',
  tbs: 'tabs', prg: 'progress', alt: 'alert', ci: 'chatInput', md: 'markdown',
  rg: 'radioGroup', ms: 'multiSelect', tgl: 'toggle', sld: 'slider',
  div: 'divider', bdg: 'badge', acc: 'accordion', cb: 'codeBlock', lnk: 'link',
  azl: 'azureLogin', azrf: 'azureResourceForm',
  qst: 'questionnaire', cmb: 'combobox', ce: 'costEstimate',
};

export function expandCompact(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(expandCompact);

  // Preserve arbitrary data-object keys for table rows/list items.
  // Expanding keys like `v` -> `version` inside data payloads breaks
  // column lookups such as row["v"] and results in blank table cells.
  const preserveDataKeys = (value: any): any => {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(preserveDataKeys);
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = preserveDataKeys(v);
    }
    return result;
  };

  const rawType = typeof obj.t === 'string'
    ? obj.t
    : (typeof obj.type === 'string' ? obj.type : undefined);
  const expandedType = rawType ? (TYPE_MAP[rawType] ?? rawType) : undefined;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = KEY_MAP[key] ?? key;
    const shouldPreserveDataKeys =
      (expandedType === 'table' && fullKey === 'rows') ||
      (expandedType === 'list' && fullKey === 'items');

    let expanded = shouldPreserveDataKeys
      ? preserveDataKeys(value)
      : expandCompact(value);

    if (fullKey === 'type' && typeof expanded === 'string') {
      expanded = TYPE_MAP[expanded] ?? expanded;
    }
    result[fullKey] = expanded;
  }
  return result;
}

export const COMPACT_PROMPT = `
Use abbreviated keys and type names. The client expands them.

Keys: v=version tt=title m=agentMessage ly=layout st=state th=theme
  t=type ch=children s=style c=content vr=variant
  b=bind l=label ph=placeholder it=inputType o=options d=description
  lb=label oc=onClick os=onSubmit dis=disabled val=value
  cols=columns rows=rows hd=header k=key w=width
  items=items tmpl=itemTemplate tabs=tabs id=id max=max sev=severity
  pr=prompt nm=name pl=payload mn=min mx=max stp=step
  clr=color code=code lang=language href=href ext=external
  rt=resourceType pc=primaryColor bg=backgroundColor sc=surfaceColor tc=textColor

Types: tx=text btn=button inp=input sel=select img=image
  ctr=container crd=card lst=list tbl=table frm=form
  tbs=tabs prg=progress alt=alert ci=chatInput md=markdown
  rg=radioGroup ms=multiSelect tgl=toggle sld=slider
  div=divider bdg=badge acc=accordion cb=codeBlock lnk=link

Example:
{"m":"Pick one","ly":{"t":"ctr","ch":[{"t":"rg","l":"Cloud","b":"cloud","o":[{"l":"AWS","val":"aws"},{"l":"Azure","val":"azure"}]},{"t":"btn","lb":"Next","oc":{"t":"sendPrompt","pr":"Selected: {{st.cloud}}"}}]}}

ALWAYS use compact notation.`;
