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
  window.PlazaDirectory = Object.freeze({categories,filter});
})();
