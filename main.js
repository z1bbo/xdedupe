const STORAGE_UPDATE_BATCH_SIZE = 10;
// TODO next version: make TTL days configurable
const DEFAULT_TTL_DAYS = 7;
const INTERVAL_MS = 80;

let db;
var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || window.shimIndexedDB;
const dbName = "SeenTweets";
const storeName = "seen_tweets";
const dbVersion = 1;

const openDBRequest = indexedDB.open(dbName, dbVersion);

openDBRequest.onerror = function(event) {
  console.error("Database error: " + event.target.error);
};

openDBRequest.onsuccess = function(event) {
  db = event.target.result;
  console.log("Database opened successfully");
};

openDBRequest.onupgradeneeded = function(event) {
  db = event.target.result;
  db.createObjectStore(storeName, { keyPath: "id" });
  console.log("Object store created");
};

const seen = new Map();
const undoneTweets = new Set();
let newCount = 0;
let lastScrollTime = 0;
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
        resolve(seen);
      }
    };

    transaction.onerror = function(event) {
      reject("Transaction error: " + event.target.error);
    };
  });
}

function handleScroll() {
  const now = Date.now();
  if (now - lastScrollTime < INTERVAL_MS) {
    return;
  }
  lastScrollTime = now;
  handleRemoveSeenTweetsBelow();
  handleScrollTweetTransition();
}

function handleScrollTweetTransition() {
  for (const tweet of oldTweets) {
    const rect = tweet.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0 && rect.bottom < 220) {
      addSeen(tweet);
    }
  }
  oldTweets = getTweets();
}

function getTweets() {
  const tweets = document.querySelectorAll('article[role="article"][data-testid="tweet"]');
  // all tweets below the current scroll position, where still at least a part is visible at the bottom
  return Array.from(tweets)
    .reduce((acc, tweet) => {
      if (acc.length > 0 || tweet.getBoundingClientRect().bottom >= 160) {
        acc.push(tweet);
      }
      return acc;
    }, []);
}

function addSeen(tweet, ttlDays = DEFAULT_TTL_DAYS) {
  const id = getId(tweet);
  if (id === null) {
    // TODO remove log once finished debugging all pages
    console.log(`weird, cannot get ID: ${JSON.stringify(tweet)}`);
    return;
  }
    // TODO remove log once finished debugging all pages
  console.log("seen ", id);
  const expireAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  seen.set(id, expireAt);

  new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const request = objectStore.put({ id: id, expire_at: expireAt });

    request.onerror = function(event) {
      reject("Error adding/updating record: " + event.target.error);
    };

    request.onsuccess = function(event) {
      resolve("Record added/updated successfully");
    };
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

function handleRemoveSeenTweetsBelow() {
  const tweets = getTweets();
  // don't hide the top tweet on the /status/{id} page
  var i = window.location.href.match(/^https:\/\/x\.com\/\w+\/status\/\d+$/) ? 1 : 0;
  for (; i < tweets.length; i++) {
    const bottomThreshold = Math.min(window.scrollY - 100, window.innerHeight + 50);
    const tweet = tweets[i];
    const tweetTop = tweet.getBoundingClientRect().top;
    
    const id = getId(tweet);
    if (tweetTop > bottomThreshold && hasSeen(id)) {
      replaceWithPlaceholder(tweet, id);
    }
  }
}

function replaceWithPlaceholder(tweet, tweetId) {
  const placeholder = tweet.cloneNode(true);
  placeholder.removeAttribute('data-testid');
  const outer = placeholder.firstChild.firstChild
  // remove empty margin div at the top
  outer.removeChild(outer.firstChild);
  const inner = outer.firstChild;
  const namePanelParent = inner.children[1];
  while (namePanelParent.children.length > 1) {
    namePanelParent.removeChild(namePanelParent.lastChild);
  }
  const namePanel = namePanelParent.firstElementChild.firstElementChild;
  namePanel.removeChild(namePanel.lastChild);
  const viewButton = document.createElement('span');
  viewButton.innerHTML = '<strong>View</strong>';
  viewButton.style.cssText = 'font-family: serif; transition: background-color 0.1s ease; cursor: pointer; padding: 2px 9px;';
  viewButton.addEventListener('mouseover', () => {
    viewButton.style.backgroundColor = 'lightgrey';
  });
  viewButton.addEventListener('mouseout', () => {
    viewButton.style.backgroundColor = 'transparent';
  });
  placeholder.addEventListener('click', (event) => {
    event.preventDefault();
    placeholder.replaceWith(tweet);
    undoneTweets.add(tweetId);
  });

  namePanel.appendChild(viewButton);

  const faceDiv = inner.firstChild.firstChild;
  faceDiv.style.transform = 'scale(0.7)';
  faceDiv.style.transformOrigin = 'center';

  inner.lastChild.style.paddingBottom = '0px';

  tweet.replaceWith(placeholder);
}

function hasSeen(id) {
  if (id === null) {
    return false;
  }
  return !!seen.get(id) && !undoneTweets.has(id);
}

loadSeen();
window.addEventListener('scroll', handleScroll, { passive: true });
window.addEventListener('focus', loadSeen);
window.addEventListener('focus', handleScroll, { passive: true });