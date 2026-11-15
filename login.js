import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const $ = s => document.querySelector(s);
let mode = 'login';

function say(text, ok = false) {
  $('#msg').textContent = text;
  $('#msg').className = ok ? 'ok' : '';
}

function setMode(m) {
  mode = m;
  const signup = m === 'signup';
  $('#heading').textContent = signup ? 'Create account' : 'Welcome back';
  $('#hint').textContent = signup ? 'Create an account with your email and password.' : 'Log in to see your boards.';
  $('#submit').textContent = signup ? 'Create account' : 'Log in';
  $('#switchText').textContent = signup ? 'Already have an account?' : 'New here?';
  $('#switchBtn').textContent = signup ? 'Log in' : 'Create an account';
  $('#confirmWrap').hidden = !signup;
  $('#pass2').required = signup;
  $('#pass').autocomplete = signup ? 'new-password' : 'current-password';
  say('');
}

function authErrorMessage(err) {
  switch (err.code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account. Choose Log in instead.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is disabled. Enable it in Firebase Console under Authentication → Sign-in method.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase. Check your internet connection and try again.';
    default:
      return 'Firebase sign-in failed. Please try again.';
  }
}

$('#switchBtn').onclick = () => setMode(mode === 'login' ? 'signup' : 'login');

$('#form').onsubmit = async e => {
  e.preventDefault();
  const email = $('#user').value.trim().toLowerCase();
  const password = $('#pass').value;
  const submit = $('#submit');
  submit.disabled = true;
  say('');

  try {
    let credential;
    if (mode === 'signup') {
      if (password !== $('#pass2').value) {
        say('Passwords do not match.');
        return;
      }
      credential = await createUserWithEmailAndPassword(auth, email, password);
    } else {
      credential = await signInWithEmailAndPassword(auth, email, password);
    }

    localStorage.setItem('currentUser', credential.user.uid);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Firebase authentication failed:', err);
    say(authErrorMessage(err));
  } finally {
    submit.disabled = false;
  }
};

onAuthStateChanged(auth, user => {
  if (!user) return;
  try {
    localStorage.setItem('currentUser', user.uid);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Could not save the signed-in user:', err);
    say('Signed in, but browser storage is unavailable. Enable storage and reload.');
  }
}, err => {
  console.error('Could not check Firebase sign-in state:', err);
  say('Could not check your sign-in. Reload the page and try again.');
});
