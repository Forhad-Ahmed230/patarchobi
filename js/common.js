import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { CFG } from './config.js';
const app = initializeApp(CFG);
export const auth = getAuth(app), db = fs.getFirestore(app);
export { fs, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification };
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
export const okUrl = u => /^https:\/\/[^\s"'<>]+$/.test(u || '');
// ছবি ছোট করে JPEG data-URL বানায় (Firestore ডকুমেন্টে ঢোকে)
const loadImg = f => new Promise((ok, no) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); i.naturalWidth ? ok(i) : no(); }; i.onerror = () => { URL.revokeObjectURL(u); no(); }; i.src = u; });
export async function shrink(file, max = 1000, q = .72) {
  let b; // প্রথমে createImageBitmap, না পারলে <img> দিয়ে; দুটোই ব্যর্থ হলে পরিষ্কার বার্তা
  try { b = await createImageBitmap(file); }
  catch { b = await loadImg(file).catch(() => { throw new Error('ছবিটি পড়া যায়নি। JPG, PNG বা WebP ছবি দিন। (iPhone-এর HEIC ছবি হলে আগে JPG করে নিন, অথবা ছবিটির স্ক্রিনশট নিয়ে সেটি দিন।)'); }); }
  const w = b.naturalWidth || b.width, h = b.naturalHeight || b.height, s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
export const LABEL = { Pending: 'অপেক্ষমাণ', Accepted: 'গৃহীত', InProgress: 'তৈরি হচ্ছে', PreviewReady: 'প্রিভিউ প্রস্তুত', ChangeRequested: 'পরিবর্তনের অনুরোধ', CustomerApproved: 'ক্রেতা অনুমোদিত', Shipped: 'পাঠানো হয়েছে', Delivered: 'ডেলিভারি সম্পন্ন', Rejected: 'প্রত্যাখ্যাত', Cancelled: 'বাতিল' };
export async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
export const DEF_CATS = 'Single Portrait|500||১ জনের ছবি\nFamily Portrait|1000||২–৩ জনের ছবি\nCouple Portrait|1200||২ জনের ছবি\nName Art|300||নামের ডিজাইন'; // নাম|মূল্য ৳|সর্বোচ্চ ৳ (ঐচ্ছিক, পরিসীমার জন্য)|বর্ণনা
export const DEF_REFUND = '১. কাজ শুরুর আগে অর্ডার বাতিল করলে অগ্রিম টাকা ফেরত দেওয়া হবে।\n২. শিল্পকর্মের কাজ শুরু হয়ে গেলে অগ্রিম টাকা ফেরতযোগ্য নয়, কারণ প্রতিটি কাজ ক্রেতার ছবি দেখে হাতে তৈরি।\n৩. প্রিভিউ পছন্দ না হলে "পরিবর্তন চাই" দিয়ে মন্তব্য লিখতে পারবেন; সংশোধন করে নতুন প্রিভিউ দেখানো হবে।\n৪. ক্রেতার অনুমোদনের পরেই শিল্পকর্ম কুরিয়ারে পাঠানো হয়।\n৫. ফেরতযোগ্য টাকা বিকাশের মাধ্যমে ফেরত দেওয়া হবে।\n৬. কুরিয়ারে পণ্য ক্ষতিগ্রস্ত হলে ডেলিভারির সময়ই কুরিয়ারের সামনে দেখিয়ে আমাদের জানান।';
export const DEF_PRIVACY = '১. আপনার নাম, মোবাইল নম্বর, ঠিকানা ও ছবি শুধু অর্ডার সম্পন্ন করতে ব্যবহার করা হয়।\n২. আপনার ছবি আপনার সম্মতি ছাড়া ওয়েবসাইটে দেখানো হয় না। ফোন নম্বর ও ঠিকানা কখনোই দেখানো হয় না।\n৩. যেকোনো সময় আপনার ছবি সরিয়ে ফেলার অনুরোধ করতে পারবেন।\n৪. আপনার তথ্য বিক্রি করা হয় না। ডেলিভারির জন্য শুধু কুরিয়ারকে নাম, মোবাইল ও ঠিকানা দেওয়া হয়।';
