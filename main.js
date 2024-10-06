const STORAGE_UPDATE_BATCH_SIZE = 10;
// TODO next version: make TTL days configurable
const DEFAULT_TTL_DAYS = 7;
const INTERVAL_MS = 80;

let db;
var indexedDB = window.indexedDB;
const dbName = "SeenTweets";
const storeName = "seen_tweets";
const dbVersion = 1;

function initializeDB() {
  return new Promise((resolve, reject) => {
    const openDBRequest = indexedDB.open(dbName, dbVersion);

    openDBRequest.onerror = function(event) {
      console.error("Database error: " + event.target.error);
      reject(event.target.error);
    };

    openDBRequest.onsuccess = function(event) {
      db = event.target.result;
      console.log("Database opened successfully");
      resolve(db);
    };

    openDBRequest.onupgradeneeded = function(event) {
      db = event.target.result;
      db.createObjectStore(storeName, { keyPath: "id" });
      console.log("Object store created");
    };
  });
}

const seen = new Map();
const undoneTweets = new Set();
let oldTweets = [];

function loadSeen() {
  return new Promise((resolve, reject) => {
    console.log("starting loadSeen");
    const transaction = db.transaction([storeName], "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const now = Date.now();

      let taken = 0;
      let deled = 0;
    objectStore.openCursor().onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.expire_at > now) {
          seen.set(cursor.value.id, cursor.value.expire_at);
          taken++;
        } else {
          cursor.delete();
          deled++;
        }
        cursor.continue();
      } else {
        console.log("loaded ", taken, " deleted ", deled);
        console.log("db load took ms:", Date.now() - now);
        resolve(seen);
      }
    };

    transaction.onerror = function(event) {
      reject("Transaction error: " + event.target.error);
    };
  });
}

function addAndHideSeen() {
  const tweets = getTweets();
  hideSeenTweetsBelow(tweets);
  markScrolledByTweetsSeen(tweets);
  return tweets.length > 0;
}

function getTweets() {
  const tweets = document.querySelectorAll('article[role="article"][data-testid="tweet"]');
  return Array.from(tweets).filter(tweet => tweet.getBoundingClientRect().bottom >= 140);
}

function markScrolledByTweetsSeen(newTweets) {
  for (const tweet of oldTweets) {
    const rect = tweet.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0 && rect.bottom < 220) {
      addSeen(tweet);
    }
  }
  oldTweets = newTweets;
}

function addSeen(tweet, ttlDays = DEFAULT_TTL_DAYS) {
  const id = getId(tweet);
  if (id === null) {
    return;
  }
  const expireAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  seen.set(id, expireAt);
  new Promise(() => {
    const transaction = db.transaction([storeName], "readwrite");
    const objectStore = transaction.objectStore(storeName);
    objectStore.put({ id: id, expire_at: expireAt });
  });
}

function getId(tweet) {
  const username = getUsername(tweet);
  // /analytics for the /home page
  // /history for e.g. the /status page
  const statusLink = tweet.querySelector(`a[href^="/${username}/status/"][href$="/analytics"], a[href^="/${username}/status/"][href$="/history"]`);
  if (statusLink === null) {
    return null;
  }
  const parts = statusLink.href.split('/');
  return parts[parts.length - 2];
}

function getUsername(tweet) {
  const usernameHref = tweet.querySelector('[data-testid^="UserAvatar-Container-"]').querySelector('a[href]').href
  return usernameHref.split('/').pop();
}

function hideSeenTweetsBelow(tweets) {
  // don't hide the top tweet on the /status/{id} page
  var i = window.location.href.match(/^https:\/\/x\.com\/\w+\/status\/\d+$/) ? 1 : 0;
  for (; i < tweets.length; i++) {
    const bottomThreshold = 140;
    const tweet = tweets[i];
    const tweetTop = tweet.getBoundingClientRect().top;
    const id = getId(tweet);
    if (tweetTop > bottomThreshold && hasSeen(id)) {
      replaceWithPlaceholder(tweet, id);
    }
  }
}

function replaceWithPlaceholder(tweet, tweetId) {
  const originalDataTestid = tweet.getAttribute('data-testid');
  tweet.removeAttribute('data-testid');
  const hidden = [];
  const outer = tweet.firstChild.firstChild;
  hide(outer.firstChild, hidden);
  const inner = outer.lastChild;
  const namePanelParent = inner.children[1];
  for (let i = 1; i < namePanelParent.children.length; i++) {
    hide(namePanelParent.children[i], hidden);
  }
  const namePanel = namePanelParent.firstElementChild.firstElementChild;
  hide(namePanel.lastChild, hidden);

  const viewButton = document.createElement('span');
  viewButton.innerHTML = 'View';
  viewButton.style.cssText = `
    font-family: "TwitterChirp";
    font-size: 0.9em;
    transition: background-color 0.1s ease;
    cursor: pointer;
    padding: 2px 0px;
  `;
  viewButton.addEventListener('mouseover', () => {
    viewButton.style.backgroundColor = 'lightgrey';
  });
  viewButton.addEventListener('mouseout', () => {
    viewButton.style.backgroundColor = 'transparent';
  });

  const faceDiv = inner.firstChild.firstChild;
  const originalInnerBottomPadding = window.getComputedStyle(inner.lastChild).paddingBottom;
  faceDiv.style.transform = 'scale(0.7)';
  faceDiv.style.transformOrigin = 'center';
  inner.lastChild.style.paddingBottom = '0px';

  tweet.addEventListener('click', function restoreTweet(event) {
    event.preventDefault();
    viewButton.remove();
    hidden.forEach(node => node.style.display = '');
    tweet.setAttribute('data-testid', originalDataTestid);
    faceDiv.style.transform = 'scale(1.0)';
    inner.lastChild.style.paddingBottom = originalInnerBottomPadding;
    undoneTweets.add(tweetId);
    tweet.removeEventListener('click', restoreTweet);
  });

  namePanel.appendChild(viewButton);
}

function hide(node, hidden) {
  node.style.display = 'none';
  hidden.push(node)
}

function hasSeen(id) {
  if (id === null) {
    return false;
  }
  return !!seen.get(id) && !undoneTweets.has(id);
}

let intervalId = null;

async function startExtension() {
  await initializeDB();
  await loadSeen();
  intervalId = setInterval(addAndHideSeen, 900);
  window.addEventListener('focus', loadSeen, { passive: true });
  window.addEventListener('focus', addAndHideSeen, { passive: true });
}

function stopExtension() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  window.removeEventListener('focus', loadSeen, { passive: true });
  window.removeEventListener('focus', addAndHideSeen, { passive: true });
}

function toggleExtension(active) {
  console.log("toggle got triggered, value", active);
  if (active === null || active === "true") {
    startExtension();
  } else {
    stopExtension();
  }
}

browser.storage.local.get('xdedupeActive').then((result) => {
  console.log("startup trigger browser.storage.local.get('xdedupeActive')");
  console.log("value", result.xdedupeActive);
  toggleExtension(result.xdedupeActive);
});

browser.storage.onChanged.addListener((changes, area) => {
  console.log("listenger triggered, area", area, "changes", changes);
  if (area === 'local' && 'xdedupeActive' in changes) {
    toggleExtension(changes.xdedupeActive.newValue);
  }
});