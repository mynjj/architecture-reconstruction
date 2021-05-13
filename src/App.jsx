import React, {useEffect, useRef, useMemo, useState, useCallback} from 'react';
import {Form} from 'react-bootstrap';
import drawGraph, {getCappedModuleName, getModuleDetails, createSvg} from './d3-graph';
import reconstructionJSON from './reconstruction.json'; 
import _ from 'lodash/fp';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css'

const uniqModules = _.uniqBy('moduleName');
const onlyInternal = _.filter(_.negate(_.iteratee('external')));

const uniqueEdges = _.uniqBy(_.isEqual);

const modulesMaxDepth = _.max(_.map(m=>m.moduleName.split('.').length, _.filter(m=>!m.external, reconstructionJSON.modules)));

const getGraphData = (completeGraph, {externalDependencies, packagesDepth})=>{
    let modulesPipeline = [];

    if(!externalDependencies){
	modulesPipeline.push(onlyInternal);
    }
    const cappedModuleName = getCappedModuleName(packagesDepth);
    const capDepth = _.map(module=>({
	...module,
	moduleName: cappedModuleName(module.moduleName)
    }));
    modulesPipeline.push(capDepth);
    modulesPipeline.push(uniqModules);

    const modules = _.flow(...modulesPipeline)(completeGraph.modules);
    const modulesObj = _.keyBy('moduleName', modules);

    const validRequires = ([p1, p2])=>
	  !!modulesObj[p1] && !!modulesObj[p2] && p1!==p2;
    const onlyValidRequires = _.filter(validRequires);
    const mergeByCap = _.map(_.map(cappedModuleName));
    const requiresPipeline = [
	mergeByCap,
	onlyValidRequires,
	uniqueEdges
    ];
    const requires = _.flow(...requiresPipeline)(completeGraph.requires);

    return {modules, requires};
};

const sortModulesComplexity = _.sortBy([m=>_.sumBy('complexity', m.mccabe)]);
const getArtifactsComplexity = _.flatMap(m=>_.map(n=>({moduleName: m.moduleName, ...n}), m.mccabe));
const sortArtifactsComplexity = _.flow(
    getArtifactsComplexity,
    _.sortBy('complexity')
);

const CustomModules = ({graphData, selected, setSelected}) => {
    const [show, setShow] = useState(false);
    useEffect(()=>{
	setSelected(graphData.modules.map(m=>m.moduleName));
    }, [graphData]);
    const checked=n=>_.includes(n, selected)
    const toggle=m=>()=>{
	if(checked(m)){
	    setSelected(s=>_.filter(x=>x!==m, s))
	}
	else {
	    setSelected(s=>[...s, m])
	}
    }
    const addOutgoing = ()=>{
	const added = _.map(([f, t])=>t, _.filter(([f, t])=>_.includes(f, selected), graphData.requires));
	setSelected(s=>[...s, ...added]);
    }
    const addIncoming = ()=>{
	const added = _.map(([f, t])=>f, _.filter(([f, t])=>_.includes(t, selected), graphData.requires));
	setSelected(s=>[...s, ...added]);
    };
    const toggleAll = ()=>{
	if(selected.length === 0){
	    setSelected(graphData.modules.map(m=>m.moduleName));
	}
	else {
	    setSelected([]);
	}
    };

    return (
	<>
	    <div style={{display: 'flex'}}>
		<a href="#" style={{color: 'black'}} onClick={(e)=>{
		       e.preventDefault();
		    setShow(s=>!s);
		    setSelected(graphData.modules.map(m=>m.moduleName));
		}}> > Choose shown modules </a>
	    </div>
	    {show&&(
		<>
		    <div style={{display: 'flex', justifyContent: 'space-between'}}>
			<a onClick={e=>{e.preventDefault();toggleAll();}} href="#" style={{color: 'black'}}>Toggle all</a>
			<a onClick={e=>{e.preventDefault();addOutgoing();}} href="#" style={{color: 'black'}}>Add dependencies</a>
			<a onClick={e=>{e.preventDefault();addIncoming();}} href="#" style={{color: 'black'}}>Add modules depending</a>
		    </div>
		    <Form.Group style={{maxHeight: '200px', overflow: 'auto'}}>
			{graphData.modules.map(m=>(
			    <Form.Check key={m.moduleName} onChange={toggle(m.moduleName)} checked={checked(m.moduleName)} type="checkbox" label={m.moduleName}/>
			))}
		    </Form.Group>
		</>
	    )}
	</>
    );
};

const onlySelected = (selected, graphData, config)=>getGraphData({
    ...graphData,
    modules: _.filter(m=>_.includes(m.moduleName, selected), graphData.modules)
}, config)

export default ()=>{
    const svgRef = useRef(null);
    const [externalDependencies, setExternalDependencies] = useState(false);
    const [packagesDepth, setPackagesDepth] = useState(2);
    const [showNames, setShowNames] = useState(true);
    const [selectedModule, setSelectedModule] = useState(null);

    const dataConfiguration = useMemo(()=>({
	externalDependencies,
	packagesDepth
    }), [externalDependencies, packagesDepth]);
    const selectedModuleDetails = useMemo(()=>
	getModuleDetails(selectedModule, reconstructionJSON, dataConfiguration)
    , [dataConfiguration, selectedModule]);
    const graphData = useMemo(()=>
	getGraphData(reconstructionJSON, dataConfiguration)
    , [dataConfiguration]);

    const [selected, setSelected] = useState(graphData.modules.map(m=>m.moduleName));
    const onNodeClick = useCallback((event, d)=>{
	setSelectedModule(d.id)
    }, []);
    const visualConfiguration = useMemo(()=>({
	showNames,
	onNodeClick
    }), [showNames, onNodeClick]);
    const d3Node = useCallback((ref)=>{
	if(!!svgRef.current){
	    return;
	}
	svgRef.current = createSvg(ref)
    }, [graphData]);
    useEffect(()=>{
	if(!svgRef.current){
	    return;
	}
	const env={completeGraph: reconstructionJSON, dataConfiguration};
	drawGraph(
	    svgRef.current,
	    onlySelected(selected, graphData, dataConfiguration),
	    visualConfiguration,
	    env
	);
	return ()=>svgRef.current.selectAll('*').remove();
    }, [graphData, visualConfiguration, selected, dataConfiguration]);
    const [showModuleBreakdown, setShowModuleBreakdown] = useState(false);
    const [showSubmoduleBreakdown, setShowSubmoduleBreakdown] = useState(false);
    const sortedComplexModules = useMemo(()=>_.reverse(sortModulesComplexity(reconstructionJSON.modules)).slice(0, 5), []);
    const sortedComplexArtifacts = useMemo(()=>_.reverse(sortArtifactsComplexity(reconstructionJSON.modules)).slice(0, 5), []);
    return (
	<>
	    <h1 style={{textAlign: 'center'}}>Polymetric view reconstruction - Scrapy</h1>
	    {selectedModule&&(
		<div style={{fontWeight: 'bold', borderRadius: '5px', color: 'white', position: 'fixed', backgroundColor: 'rgba(0,0,0,0.6)', width: '33%', left: '10px', padding: '5px 8px', maxHeight: '85vh', overflow: 'auto'}}>
		    {selectedModule}<span style={{position: 'absolute', right: '5px'}}><a href="#" style={{color: 'white'}} onClick={e=>{e.preventDefault();setSelectedModule(null);}}>x</a></span>
		    <hr/>
		    <div style={{display: 'flex', justifyContent: 'space-between'}}>
			<div>
			    Module McCabe complexity: 
			</div>
			<div>{selectedModuleDetails.moduleComplexity}</div>
		    </div>
		    {(selectedModuleDetails.mccabe&&selectedModuleDetails.mccabe.length)&&(
			<div style={{marginLeft: '8px', marginRight: '8px'}}>
			    <a href="#" style={{color: 'white'}} onClick={(e)=>{e.preventDefault();setShowModuleBreakdown(b=>!b)}}> > Breakdown </a>
			    {showModuleBreakdown&&selectedModuleDetails.mccabe.map(({artifact, complexity})=>(
				<div key={artifact} style={{display: 'flex', justifyContent: 'space-between'}}>
				    <div>{artifact}</div>
				    <div>{complexity}</div>
				</div>
			    ))}
			</div>
		    )}
		    <div style={{display: 'flex', justifyContent: 'space-between'}}>
			<div>
			    Submodules McCabe complexity: 
			</div>
			<div>{_.sumBy('mccabeComplexity', selectedModuleDetails.submodulesComplexity)}</div>
		    </div>
		    {(selectedModuleDetails.submodulesComplexity.length)&&(
			<div style={{marginLeft: '8px', marginRight: '8px'}}>
			    <a href="#" style={{color: 'white'}} onClick={()=>setShowSubmoduleBreakdown(b=>!b)}> > Breakdown </a>
			    {showSubmoduleBreakdown&&selectedModuleDetails.submodulesComplexity.map(({moduleName, mccabeComplexity})=>(
				<div key={moduleName} style={{display: 'flex', justifyContent: 'space-between'}}>
				    <div>{moduleName}</div>
				    <div>{mccabeComplexity}</div>
				</div>
			    ))}
			</div>
		    )}
		</div>
	    )}
	    <div style={{padding: '20px 40px', display: 'flex'}}>
		<div style={{flex: 3}} ref={d3Node}/>
		<div style={{flex: 1, backgroundColor: '#fafafa', borderRadius: '8px', padding: '5px 20px', display: 'flex', flexDirection: 'column'}}>
		    <h1 style={{textAlign: 'center'}}>Configuration</h1>
		    <hr/>
		    <Form>
			<Form.Group>
			    <Form.Label>Depth of packages shown</Form.Label>
			    <Form.Control as="select" value={packagesDepth} onChange={e=>setPackagesDepth(e.target.value)}>
				{_.times(x=>x+1, modulesMaxDepth).map(v=><option key={v}>{v}</option>)}
			    </Form.Control>
			</Form.Group>
			<Form.Group>
			    <Form.Check checked={externalDependencies} onChange={()=>setExternalDependencies(d=>!d)} type="checkbox" label="Show external dependencies"/>
			</Form.Group>
			<Form.Group>
			    <Form.Check checked={showNames} onChange={()=>setShowNames(d=>!d)} type="checkbox" label="Show names"/>
			</Form.Group>
		    </Form>
		    <CustomModules selected={selected} setSelected={setSelected} graphData={graphData}/>
		    <hr/>
		    <h1 style={{textAlign: 'center'}}>Trivia</h1>

		    <h3>Top complex files</h3>
		    {sortedComplexModules.map(m=>(
		    <div style={{display: 'flex', justifyContent: 'space-between'}}>

			<div>{m.moduleName}</div>
			<div>{_.sumBy('complexity', m.mccabe)}</div>
		    </div>
		    ))}

		    <h3>Top complex artifacts</h3>
		    {sortedComplexArtifacts.map(m=>(
			<>
		    <div style={{display: 'flex', justifyContent: 'space-between'}}>

			<div>{m.moduleName} - {m.artifact}</div>
			<div>{m.complexity}</div>
		    </div>
			    <hr/>
			    </>
		    ))}

		</div>
	    </div>
	</>
    );
};
