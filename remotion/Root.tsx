import React from "react";
import { Composition } from "remotion";
import { NeoFuturism } from "./compositions/NeoFuturism";
import { ConcreteHorizon } from "./compositions/ConcreteHorizon";
import { SummitView } from "./compositions/SummitView";
import { AlpineArchitects } from "./compositions/AlpineArchitects";
import { MountainEscape } from "./compositions/MountainEscape";
import { AlpineDream } from "./compositions/AlpineDream";
import { AlpineSanctuary } from "./compositions/AlpineSanctuary";
import { TheArchitectureofSere } from "./compositions/TheArchitectureofSere";
import { TheArtoftheView } from "./compositions/TheArtoftheView";
import { TheGeometryofScale } from "./compositions/TheGeometryofScale";
import { NeonRebel } from "./compositions/NeonRebel";
import { NeonSwagger } from "./compositions/NeonSwagger";
import { StaticSignal } from "./compositions/StaticSignal";
import { MidnightCruise } from "./compositions/MidnightCruise";
import { MidnightDriveMood } from "./compositions/MidnightDriveMood";
import { MidnightReflections } from "./compositions/MidnightReflections";
import { MidnightRun } from "./compositions/MidnightRun";
import { TheRoastReel } from "./compositions/TheRoastReel";
import { UNBOTHERED } from "./compositions/UNBOTHERED";
import { TheRoastSession } from "./compositions/TheRoastSession";
import { AttitudeCheck } from "./compositions/AttitudeCheck";
import { MidnightManifesto } from "./compositions/MidnightManifesto";
import { NIGHTDRIVEGLITCH } from "./compositions/NIGHTDRIVEGLITCH";
import { THEPLASTICMANIFESTO } from "./compositions/THEPLASTICMANIFESTO";
import { TheBlueprintDesigning } from "./compositions/TheBlueprintDesigning";
import { PlasticDecay } from "./compositions/PlasticDecay";
import { Reel, DEFAULT_SCENES } from "./compositions/Reel";
import {
  computeReelDuration,
  type CinematicReelProps,
} from "./components/CinematicReel";
import {
  HtmlSlideVideo,
  computeHtmlSlideVideoDuration,
  type HtmlSlideVideoProps,
} from "./compositions/HtmlSlideVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Dynamic, data-driven reel — duration auto-computed from scene count via calculateMetadata. */}
      <Composition
        id="Reel"
        component={Reel as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={computeReelDuration(DEFAULT_SCENES.length)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          scenes: DEFAULT_SCENES,
          brandName: "VISIO●REEL",
          sceneLengthInFrames: 75,
          transitionLengthInFrames: 18,
        }}
        calculateMetadata={({ props }) => {
          const p = props as unknown as CinematicReelProps;
          return {
            durationInFrames: computeReelDuration(
              p.scenes?.length ?? 0,
              p.sceneLengthInFrames ?? 75,
              p.transitionLengthInFrames ?? 18
            ),
            props,
          };
        }}
      />
      <Composition
        id="HtmlSlideVideo"
        component={
          HtmlSlideVideo as unknown as React.ComponentType<Record<string, unknown>>
        }
        durationInFrames={computeHtmlSlideVideoDuration(1)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          slidePaths: [],
          width: 1080,
          height: 1920,
          sceneLengthInFrames: 90,
          transitionLengthInFrames: 12,
        }}
        calculateMetadata={({ props }) => {
          const p = props as unknown as HtmlSlideVideoProps;
          const n = p.slidePaths?.length ?? 0;
          const sceneLen = p.sceneLengthInFrames ?? 90;
          const transLen = p.transitionLengthInFrames ?? 12;
          return {
            durationInFrames: computeHtmlSlideVideoDuration(n, sceneLen, transLen),
            width: p.width ?? 1080,
            height: p.height ?? 1920,
            props,
          };
        }}
      />
      <Composition id="NeoFuturism" component={NeoFuturism} durationInFrames={323} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="ConcreteHorizon" component={ConcreteHorizon} durationInFrames={118} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="SummitView" component={SummitView} durationInFrames={148} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="AlpineArchitects" component={AlpineArchitects} durationInFrames={266} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="MountainEscape" component={MountainEscape} durationInFrames={388} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="AlpineDream" component={AlpineDream} durationInFrames={899} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="AlpineSanctuary" component={AlpineSanctuary} durationInFrames={1348} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="TheArchitectureofSere" component={TheArchitectureofSere} durationInFrames={1348} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="TheArtoftheView" component={TheArtoftheView} durationInFrames={1348} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="TheGeometryofScale" component={TheGeometryofScale} durationInFrames={1348} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="NeonRebel" component={NeonRebel} durationInFrames={903} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="NeonSwagger" component={NeonSwagger} durationInFrames={900} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="StaticSignal" component={StaticSignal} durationInFrames={1348} fps={30} width={1080} height={1080} defaultProps={{}} />
      <Composition id="MidnightCruise" component={MidnightCruise} durationInFrames={1348} fps={30} width={1080} height={1350} defaultProps={{}} />
      <Composition id="MidnightDriveMood" component={MidnightDriveMood} durationInFrames={1351} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="MidnightReflections" component={MidnightReflections} durationInFrames={3598} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="MidnightRun" component={MidnightRun} durationInFrames={1350} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="TheRoastReel" component={TheRoastReel} durationInFrames={1347} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="UNBOTHERED" component={UNBOTHERED} durationInFrames={1345} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="TheRoastSession" component={TheRoastSession} durationInFrames={1344} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="AttitudeCheck" component={AttitudeCheck} durationInFrames={1352} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="MidnightManifesto" component={MidnightManifesto} durationInFrames={1358} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="NIGHTDRIVEGLITCH" component={NIGHTDRIVEGLITCH} durationInFrames={1354} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="THEPLASTICMANIFESTO" component={THEPLASTICMANIFESTO} durationInFrames={1358} fps={30} width={1080} height={1920} defaultProps={{}} />
      <Composition id="TheBlueprintDesigning" component={TheBlueprintDesigning} durationInFrames={1348} fps={30} width={1920} height={1080} defaultProps={{}} />
      <Composition id="PlasticDecay" component={PlasticDecay} durationInFrames={1344} fps={30} width={1080} height={1920} defaultProps={{}} />
    </>
  );
};
