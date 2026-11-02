import { db, fs, $, esc, DEF_REFUND, DEF_PRIVACY } from './common.js';
const fill = s => { $('#refund').innerHTML = esc(s.refundText || DEF_REFUND); $('#privacy').innerHTML = esc(s.privacyText || DEF_PRIVACY); };
fill({});
fs.getDoc(fs.doc(db, 'settings', 'site')).then(d => fill(d.data() || {})).catch(() => {});
