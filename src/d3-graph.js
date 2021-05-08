import * as d3 from 'd3';
import _ from 'lodash/fp';

const drag = simulation => {
  
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  
  function dragged(event,d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  
  function dragended(event,d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  
  return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
}

export const createSvg = (domNode) => {
    return d3.select(domNode)
	.append('svg')
	.attr('viewBox', [-250, -250, 500, 500]);
};


export const getCappedModuleName = packagesDepth=>n=>n.split('.').slice(0, packagesDepth).join('.');
export const getModuleDetails = (selected, completeGraph, {packagesDepth})=>{
    if(!selected) return null;
    const module = _.find({moduleName: selected}, completeGraph.modules);
    const getModuleComplexity = m=>m?_.sumBy('complexity', m.mccabe):0;

    const strictlyContainedSubmodule = n=>selected===getCappedModuleName(packagesDepth)(n) && n!==selected;
    const submodules = _.filter(
	({moduleName})=>strictlyContainedSubmodule(moduleName)
	, completeGraph.modules);
    const submodulesComplexity = _.map(m=>({
	...m,
	mccabeComplexity: getModuleComplexity(m)
    }), submodules);
    const moduleComplexity = getModuleComplexity(module);

    return {
	...(module||{}),
	moduleComplexity,
	submodulesComplexity
    };
};

const drawGraph = (svg, graphData, configuration, env)=>{
    const {completeGraph, dataConfiguration} = env;
    const {showNames, onNodeClick} = configuration;
    const {modules, requires} = graphData;

    const totalComplexity = ({details})=>details.moduleComplexity+_.sumBy('complexity', details.mccabe)
    const nodes = modules.map(({moduleName})=>({
	id: moduleName,
	details: getModuleDetails(moduleName, completeGraph, dataConfiguration)
    })).map(m=>({
	...m,
	complexity: totalComplexity(m)
    }));
    const maxComplexity = _.maxBy('complexity', nodes);
    const minComplexity = _.minBy('complexity', nodes);
    const minRad = 3;
    const maxRad = 15;
    const r = complexity => {
	if(minComplexity === undefined || maxComplexity === undefined){
	    return minRad;
	}
	const minC = minComplexity.complexity;
	const maxC = maxComplexity.complexity;
	if(minC===maxC){
	    return minRad;
	}
	return minRad+(complexity-minC)*(maxRad-minRad)/(maxC-minC);
    };

    const links = requires.map(([source, target])=>({source, target}))
    const simulation = d3.forceSimulation(nodes)
	.force("link", d3.forceLink(links).id(d => d.id).distance(65))
	.force("charge", d3.forceManyBody().strength(-300))
	.force("x", d3.forceX())
	.force("y", d3.forceY());

    svg.append("defs").selectAll("marker")
	.data(["triangle"])
	.enter().append("marker")
	.attr("id", "triangle")
	.attr("viewBox", "0 -5 10 10")
	.attr("refX", 15)
	.attr("refY", -1.5)
	.attr("markerWidth", 2)
	.attr("markerHeight", 2)
	.attr("orient", "auto")
	.append("path")
	.attr("d", "M0,-5L10,0L0,5");

    const link = svg.append("g")
	.attr("stroke", "#999")
	.attr("stroke-opacity", 0.6)
	.selectAll("line")
	.data(links)
	.join("line")
	.attr("stroke-width", 3)
	.attr("marker-end", "url(#triangle)");


    const node = svg.append('g')
	  .selectAll("g")
	  .data(nodes)
	  .join('g')
	  .call(drag(simulation));

    node.append('circle')
	.attr('stroke', 'white')
	.attr('stroke-width', 1.5)
	.attr("fill", "#f4a254")
	.attr('r', ({complexity})=>r(complexity));

    if(showNames){
	node.append('text')
	    .attr("x", 8)
	    .attr("y", "0.31rem")
	    .attr("font-size", "8px")
	    .text(d=>d.id)
	    .clone(true).lower()
	    .attr("fill", "none")
	    .attr("stroke", "white")
	    .attr("stroke-width", 3) ;
    }

    node.selectAll('circle').on('mouseover', (event, d)=>{
	d3.select(event.target)
	    .attr('fill', "#b33b00");
    })
    node.selectAll('circle').on('mouseout', (event, d)=>{
	d3.select(event.target)
	    .attr('fill', "#f4a254");
    })
    node.selectAll('circle').on('click', (...args)=>{
	onNodeClick && onNodeClick(...args);
    })

    simulation.on("tick", () => {
	link.attr("x1", d => d.source.x)
	    .attr("y1", d => d.source.y)
	    .attr("x2", d => d.target.x)
	    .attr("y2", d => d.target.y);

	node.attr('transform', d=>`translate(${d.x}, ${d.y})`);
    });


};

export default drawGraph;
