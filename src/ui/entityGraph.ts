import { createElement } from '../utils/dom.ts';
import * as d3 from 'd3';
import { GRAPH_DATA, getConnectedNodes, type GraphNode, type GraphEdge } from '../data/entityGraph.ts';
import type { MapView } from '../map/MapView.ts';

const NODE_COLORS: Record<string, string> = {
  country: '#ff6600',
  chokepoint: '#3b82f6',
  infrastructure: '#f59e0b',
  alliance: '#8b5cf6',
  conflict: '#ef4444',
  resource: '#22c55e',
};

const NODE_RADIUS: Record<string, number> = {
  country: 8,
  chokepoint: 6,
  infrastructure: 6,
  alliance: 10,
  conflict: 7,
  resource: 7,
};

const EDGE_COLORS: Record<string, string> = {
  controls: '#ff6600',
  threatens: '#ef4444',
  conflicts: '#ef4444',
  supplies: '#f59e0b',
  depends: '#3b82f6',
  member: '#8b5cf6',
  borders: '#444',
  trades: '#22c55e',
};

interface SimNode extends d3.SimulationNodeDatum, GraphNode {}
interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  type: string;
  label?: string;
  weight?: number;
}

export class EntityGraphPanel {
  private container: HTMLElement;
  private panel: HTMLElement | null = null;
  private simulation: d3.Simulation<SimNode, SimEdge> | null = null;
  private mapView: MapView;
  private visible = false;
  private width = 500;
  private height = 500;

  constructor(parent: HTMLElement, mapView: MapView) {
    this.container = parent;
    this.mapView = mapView;
  }

  toggle(focusNodeId?: string): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show(focusNodeId);
    }
  }

  show(focusNodeId?: string): void {
    if (this.panel) this.panel.remove();

    this.visible = true;
    this.panel = createElement('div', { className: 'nw-entity-graph-panel' });
    this.panel.innerHTML = `
      <div class="nw-entity-graph-header">
        <span class="nw-entity-graph-title">ENTITY GRAPH</span>
        <div class="nw-entity-graph-controls">
          <input type="text" class="nw-entity-graph-search" placeholder="Search entity...">
          <button class="nw-entity-graph-expand" title="Show all">ALL</button>
          <button class="nw-entity-graph-close" title="Close">✕</button>
        </div>
      </div>
      <div class="nw-entity-graph-legend">
        <span class="nw-legend-item"><span style="background:#ff6600"></span>Country</span>
        <span class="nw-legend-item"><span style="background:#3b82f6"></span>Chokepoint</span>
        <span class="nw-legend-item"><span style="background:#f59e0b"></span>Infrastructure</span>
        <span class="nw-legend-item"><span style="background:#8b5cf6"></span>Alliance</span>
        <span class="nw-legend-item"><span style="background:#ef4444"></span>Conflict</span>
        <span class="nw-legend-item"><span style="background:#22c55e"></span>Resource</span>
      </div>
      <div class="nw-entity-graph-canvas"></div>
      <div class="nw-entity-graph-info"></div>
    `;

    this.container.appendChild(this.panel);

    // Event handlers
    this.panel.querySelector('.nw-entity-graph-close')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('.nw-entity-graph-expand')?.addEventListener('click', () => this.renderFullGraph());

    const searchInput = this.panel.querySelector('.nw-entity-graph-search') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      if (query.length < 2) return;
      const match = GRAPH_DATA.nodes.find((n) => n.label.toLowerCase().includes(query) || n.id.toLowerCase() === query);
      if (match) this.focusNode(match.id);
    });

    // Render initial graph
    const canvas = this.panel.querySelector('.nw-entity-graph-canvas') as HTMLElement;
    this.width = canvas.clientWidth || 500;
    this.height = canvas.clientHeight || 400;

    if (focusNodeId) {
      this.focusNode(focusNodeId);
    } else {
      this.renderFullGraph();
    }
  }

  hide(): void {
    this.visible = false;
    this.simulation?.stop();
    this.panel?.remove();
    this.panel = null;
  }

  isVisible(): boolean {
    return this.visible;
  }

  focusNode(nodeId: string): void {
    const { nodes, edges } = getConnectedNodes(nodeId);
    this.renderGraph(nodes, edges, nodeId);

    // Show info
    const node = GRAPH_DATA.nodes.find((n) => n.id === nodeId);
    const info = this.panel?.querySelector('.nw-entity-graph-info');
    if (info && node) {
      const connections = edges.length;
      info.innerHTML = `
        <strong>${node.label}</strong> · ${node.type} · ${connections} connections
        ${node.lat ? `<button class="nw-entity-graph-flyto" data-lat="${node.lat}" data-lon="${node.lon}">Fly to →</button>` : ''}
      `;
      info.querySelector('.nw-entity-graph-flyto')?.addEventListener('click', (e) => {
        const btn = e.target as HTMLElement;
        const lat = parseFloat(btn.dataset.lat || '0');
        const lon = parseFloat(btn.dataset.lon || '0');
        this.mapView.flyTo(lon, lat, 6);
      });
    }
  }

  private renderFullGraph(): void {
    // Show top entities by connection count
    const connectionCount = new Map<string, number>();
    for (const e of GRAPH_DATA.edges) {
      connectionCount.set(e.source, (connectionCount.get(e.source) || 0) + 1);
      connectionCount.set(e.target, (connectionCount.get(e.target) || 0) + 1);
    }
    const topIds = Array.from(connectionCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30)
      .map(([id]) => id);
    const topSet = new Set(topIds);
    const nodes = GRAPH_DATA.nodes.filter((n) => topSet.has(n.id));
    const edges = GRAPH_DATA.edges.filter((e) => topSet.has(e.source) && topSet.has(e.target));
    this.renderGraph(nodes, edges);
  }

  private renderGraph(nodes: GraphNode[], edges: GraphEdge[], focusId?: string): void {
    if (!this.panel) return;
    const canvas = this.panel.querySelector('.nw-entity-graph-canvas') as HTMLElement;
    if (!canvas) return;

    // Clean up previous
    this.simulation?.stop();
    canvas.innerHTML = '';

    this.width = canvas.clientWidth || 500;
    this.height = canvas.clientHeight || 400;

    // Create SVG
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('width', String(this.width));
    svgEl.setAttribute('height', String(this.height));
    canvas.appendChild(svgEl);

    const svg = d3.select(svgEl);
    void svg;

    // Build D3 data structures
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const simEdges: SimEdge[] = edges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        label: e.label,
        weight: e.weight || 1,
      }));

    // Zoom
    const g = svg.append('g');
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        }),
    );

    // Edges
    const link = g
      .selectAll('.graph-edge')
      .data(simEdges)
      .join('line')
      .attr('class', 'graph-edge')
      .attr('stroke', (d) => EDGE_COLORS[d.type] || '#333')
      .attr('stroke-width', (d) => Math.max(1, (d.weight || 1) / 3))
      .attr('stroke-opacity', 0.5);

    // Edge labels
    const linkLabel = g
      .selectAll('.graph-edge-label')
      .data(simEdges.filter((d) => d.label))
      .join('text')
      .attr('class', 'graph-edge-label')
      .attr('font-size', '7px')
      .attr('fill', '#555')
      .attr('text-anchor', 'middle')
      .text((d) => d.label || '');

    // Nodes
    const node = g
      .selectAll<SVGGElement, SimNode>('.graph-node')
      .data(simNodes)
      .join('g')
      .attr('class', 'graph-node')
      .style('cursor', 'pointer');

    // Apply drag behavior
    const dragBehavior = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) this.simulation?.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) this.simulation?.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    node.call(dragBehavior);

    // Node circles
    node
      .append('circle')
      .attr('r', (d) => (d.id === focusId ? NODE_RADIUS[d.type] + 3 : NODE_RADIUS[d.type]))
      .attr('fill', (d) => NODE_COLORS[d.type] || '#888')
      .attr('stroke', (d) => (d.id === focusId ? '#fff' : '#0a0a0a'))
      .attr('stroke-width', (d) => (d.id === focusId ? 2 : 1));

    // Node labels
    node
      .append('text')
      .attr('dx', (d) => NODE_RADIUS[d.type] + 4)
      .attr('dy', 3)
      .attr('font-size', '9px')
      .attr('fill', '#ccc')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text((d) => d.label);

    // Click to expand
    node.on('click', (_event, d) => {
      this.focusNode(d.id);
    });

    // Force simulation
    this.simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance(80),
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(20))
      .on('tick', () => {
        link
          .attr('x1', (d) => (d.source as SimNode).x || 0)
          .attr('y1', (d) => (d.source as SimNode).y || 0)
          .attr('x2', (d) => (d.target as SimNode).x || 0)
          .attr('y2', (d) => (d.target as SimNode).y || 0);

        linkLabel
          .attr('x', (d) => (((d.source as SimNode).x || 0) + ((d.target as SimNode).x || 0)) / 2)
          .attr('y', (d) => (((d.source as SimNode).y || 0) + ((d.target as SimNode).y || 0)) / 2);

        node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`);
      });
  }

  destroy(): void {
    this.simulation?.stop();
    this.panel?.remove();
  }
}
