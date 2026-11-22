/* Presentación del catálogo; el servidor decide acceso, favoritos y vigencia. */
(() => {
  'use strict';
  const categories = [
    ['vida-cotidiana','Vida cotidiana','◌'],['musica-baile','Música y baile','♫'],
    ['mascotas','Mascotas','♧'],['barrio','Mi barrio','⌂'],['lectura','Lectura','▤'],
    ['plantas','Plantas','❋'],['otros','Otros temas','◇'],['sin-categoria','Sin categoría','#'],
  ];
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function filter(rows,{query='',view='todos',category='todos',order='nombre'}={}) {
    return rows.filter(r => (category==='todos'||r.categoria===category)
      && (view==='todos'||r.origen===view||view==='mios'&&r.soy_miembro||view==='favoritos'&&r.favorito)
      && normalize(`${r.nombre} ${r.descripcion||''} ${r.tema||''}`).includes(normalize(query)))
      .sort((a,b)=>(order==='integrantes'?Number(b.integrantes)-Number(a.integrantes):0)||a.nombre.localeCompare(b.nombre,'es'));
  }
  function action(row) {
    if(row.soy_miembro || row.puede_entrar && (row.gestionada || row.tipo!=='publica')) return {label:'Abrir chat',kind:'chat'};
    if(row.solicitud==='pendiente') return {label:'Solicitud pendiente',kind:'pendiente'};
    if(row.solicitud==='invitada') return {label:'Unirme',kind:'ingreso'};
    if(row.gestionada && row.ingreso==='aprobacion') return {label:'Solicitar ingreso',kind:'ingreso'};
    if(row.ingreso==='abierta' || !row.gestionada && row.tipo==='publica') return {label:'Unirme',kind:'ingreso'};
    return {label:'Ver sala',kind:'detalle'};
  }
  window.PlazaDirectory = Object.freeze({categories,filter,action});
})();
