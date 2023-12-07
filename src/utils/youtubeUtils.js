import debug from "./debug.js";
import { availableLangs } from "../config/constants.js";
import { langTo6391 } from "./utils.js";
import { detect } from "./translateApis.js";

// Get the language code from the response or the text
async function getLanguage(player, response, title, description) {
  if (
    !window.location.hostname.includes("m.youtube.com") &&
    player?.getAudioTrack
  ) {
    // ! Experimental ! get lang from selected audio track if availabled
    const audioTracks = player.getAudioTrack();
    const trackInfo = audioTracks?.getLanguageInfo(); // get selected track info (id === "und" if tracks are not available)
    if (trackInfo?.id !== "und") {
      return langTo6391(trackInfo.id.split(".")[0]);
    }
  }

  // TODO: If the audio tracks will work fine, transfer the receipt of captions to the audioTracks variable
  // Check if there is an automatic caption track in the response
  const captionTracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (captionTracks?.length) {
    const autoCaption = captionTracks.find((caption) => caption.kind === "asr");
    if (autoCaption && autoCaption.languageCode) {
      return langTo6391(autoCaption.languageCode);
    }
  }

  // the "delayed video upload" fix for YouTube (#387)
  if (!(description && title)) {
    return "en";
  }

  // If there is no caption track, use detect to get the language code from the description
  const cleanedDescription = description
    .split("\n")
    .filter((line) => !line.match(/https?:\/\/\S+/))
    .join("\n")
    .replace(/#\S+/g, "")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250);

  const cleanText = [cleanedDescription, title].join("");

  return await detect(cleanText);
}

function isMobile() {
  return /^m\.youtube\.com$/.test(window.location.hostname);
}

function getPlayer() {
  if (window.location.pathname.startsWith("/shorts/")) {
    return isMobile()
      ? document.querySelector("#movie_player")
      : document.querySelector("#shorts-player");
  }

  return document.querySelector("#movie_player");
}

function getPlayerResponse() {
  const player = getPlayer();
  if (player?.getPlayerResponse)
    return player?.getPlayerResponse?.call() ?? null;
  return player?.data?.playerResponse ?? null;
}

function getPlayerData() {
  const player = getPlayer();
  if (player?.getVideoData) return player?.getVideoData?.call() ?? null;
  return player?.data?.playerResponse?.videoDetails ?? null;
}

function getVideoVolume() {
  const player = getPlayer();
  if (player?.getVolume) {
    return player.getVolume.call() / 100;
  }

  return 1;
}

function setVideoVolume(volume) {
  return getPlayer()?.setVolume(Math.round(volume * 100));
}

function videoSeek(video, time) {
  // * TIME IN MS
  debug.log("videoSeek", time);
  const preTime =
    getPlayer()?.getProgressState()?.seekableEnd || video.currentTime;
  const finalTime = preTime - time; // we always throw it to the end of the stream - time
  video.currentTime = finalTime;
}

function getSubtitles() {
  const response = getPlayerResponse();
  let captionTracks =
    response?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  captionTracks = captionTracks.reduce((result, captionTrack) => {
    if ("languageCode" in captionTrack) {
      const language = captionTrack?.languageCode
        ? langTo6391(captionTrack?.languageCode)
        : undefined;
      const url = captionTrack?.url || captionTrack?.baseUrl;
      language &&
        url &&
        result.push({
          source: "youtube",
          language,
          isAutoGenerated: captionTrack?.kind === "asr",
          url: `${
            url.startsWith("http") ? url : `${window.location.origin}/${url}`
          }&fmt=json3`,
        });
    }
    return result;
  }, []);
  debug.log("youtube subtitles:", captionTracks);
  return captionTracks;
}

// Get the video data from the player
async function getVideoData() {
  const player = getPlayer();
  const response = getPlayerResponse(); // null in /embed
  const data = getPlayerData();
  const { author, title } = data ?? {};
  const {
    shortDescription: description,
    isLive,
    isLiveContent,
    isUpcoming,
  } = response?.videoDetails ?? {};
  const isPremiere = (!!isLive || !!isUpcoming) && !isLiveContent;
  let detectedLanguage = await getLanguage(
    player,
    response,
    title,
    description,
    author,
  );
  if (!availableLangs.includes(detectedLanguage)) {
    detectedLanguage = "en";
  }
  const videoData = {
    isLive: !!isLive,
    isPremiere,
    title,
    description,
    author,
    detectedLanguage,
  };
  debug.log("youtube video data:", videoData);
  console.log("[VOT] Detected language: ", videoData.detectedLanguage);
  return videoData;
}

export const youtubeUtils = {
  isMobile,
  getPlayer,
  getPlayerResponse,
  getPlayerData,
  getVideoVolume,
  getSubtitles,
  getVideoData,
  setVideoVolume,
  videoSeek,
};
