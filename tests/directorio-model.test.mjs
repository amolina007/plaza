import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
const window={};
runInNewContext(readFileSync(new URL('../js/directorio-model.js',import.meta.url),'utf8'),{window});
const rows=[
 {nombre:'Música',categoria:'musica-baile',origen:'oficial',integrantes:2,favorito:true,soy_miembro:false,tema:'Canción del día'},
 {nombre:'Animales',categoria:'mascotas',origen:'usuarios',integrantes:5,favorito:false,soy_miembro:true},
];
const f=window.PlazaDirectory.filter;
assert.equal(f(rows,{view:'favoritos'}).length,1);
assert.equal(f(rows,{view:'mios'})[0].nombre,'Animales');
assert.equal(f(rows,{category:'mascotas',view:'favoritos'}).length,0);
assert.equal(f(rows,{query:'cancion'})[0].nombre,'Música');
assert.equal(f(rows,{order:'integrantes'})[0].nombre,'Animales');
assert.equal(f(rows,{query:'inexistente'}).length,0);
assert.equal(rows[0].nombre,'Música');
for(const file of ['directorio','directorio-model','plaza-client'])new Script(readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'));
export const resultado='PASS: filtros combinados, favoritos, membresía, acentos, temas, orden y sintaxis';
