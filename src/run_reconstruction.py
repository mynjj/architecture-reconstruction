from pathlib import Path
from functools import cache
import os
import ast
import json
import mccabe

root_path = None

def internal_module_path(module_name):
    inner_path = '/'.join(module_name.split('.'))
    module_path = root_path / inner_path
    package_path = module_path/'__init__.py'
    if package_path.exists():
        return package_path
    file_path = root_path / (inner_path+'.py')
    if file_path.exists():
        return file_path
    return None

def resolve_import_from(node):
    # A ImportFrom may import complete modules; in such
    # case, we want to resolve those instead of the
    # potential parent module.
    parent_module = node.module
    modules = []
    for n in node.names:
        if internal_module_path(parent_module+'.'+n.name) is not None:
            modules.append(resolve_module(parent_module+'.'+n.name))
        else:
            modules.append(resolve_module(parent_module))
    return modules
            
def get_mccabe(contents, filename):
    tree = compile(contents, filename, "exec", ast.PyCF_ONLY_AST)
    visitor = mccabe.PathGraphingAstVisitor()
    visitor.preorder(tree, visitor)
    return [{"artifact": graph.name, "complexity": graph.complexity()} for graph in visitor.graphs.values()]

def resolve_file(path):
    if not path.exists():
        raise Exception('unresolvable import')
    requires = []
    mccabe_data = None
    with open(path, 'r') as file:
        contents = file.read()
        tree = ast.parse(contents)
        mccabe_data = get_mccabe(contents, path)

        for node in tree.body:
            if isinstance(node, ast.Import):
                requires += [resolve_module(n.name) for n in node.names]
            if isinstance(node, ast.ImportFrom):
                requires += resolve_import_from(node)
    return {"requires": requires, "mccabe": mccabe_data}


resolving = set()

@cache
def resolve_module(module_name):
    global resolving
    module = {"moduleName": module_name}

    if module_name in resolving:
        # Since it's cached, the only way this can happen is when resolving a
        # circular dependency
        module['circular'] = True
        return module
    else:
        resolving.add(module_name)

    path = internal_module_path(module_name)
    if path is None:
        module['external'] = True
        return module
    module.update(resolve_file(path))
    return module


def flatten(nested_deps):
    nodes = {}
    edges = {}
    for module in nested_deps:
        nodes[module["moduleName"]] = module.copy()
        if "requires" in nodes[module["moduleName"]]:
            del nodes[module["moduleName"]]['requires']
        if 'requires' in module:
            src = module['moduleName']
            edge_key = lambda dst: src+'-'+dst['moduleName']
            outgoing = {edge_key(dst): [src, dst['moduleName']] for dst in module['requires']}
            nnodes, nedges = flatten(module['requires'])

            # We may find the same node twice, they should be the same unless
            # it came from resolving a circular dependency, in which case
            # we retain the one with more information.
            for new_module_name in nnodes:
                new_module = nnodes[new_module_name]
                if new_module_name in nodes:
                    if 'circular' in new_module:
                        continue
                nodes[new_module_name] = new_module.copy()
                
            outgoing.update(nedges)
            outgoing.update(edges)
            edges = outgoing.copy()
    return nodes, edges

def write_scrapy_reconstruction():
    global resolving
    global root_path
    root_path = Path('/home/joshua/scrapy')
    nodes = {}
    edges = {}
    for entry_file in (root_path/'scrapy').glob('**/*.py'):
        module_name = '.'.join(entry_file.parts[len(root_path.parts):])[0:-3]
        if module_name in nodes:
            continue
        if module_name.endswith("__init__"):
            module_name = module_name[0:-len("__init__")]
        resolving = set()
        nested_deps = resolve_module(module_name)
        nnodes, nedges = flatten([nested_deps])
        nodes.update(nnodes)
        edges.update(nedges)
    content = json.dumps({"modules": list(nodes.values()), "requires": list(edges.values())})
    with open('reconstruction-scrapy.json', 'w') as f:
        f.write(content)

    
write_scrapy_reconstruction()
