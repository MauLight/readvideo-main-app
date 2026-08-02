import MainColumn from "./components/main-column";
import ReaderPane from "./components/reader-pane";
import Graphic from "./components/graphic";
import { VideoProvider } from "./context/video-context";
import { KeysProvider } from "./context/keys-context";
import KeysGate from "./components/keys-gate";

export default function Home() {
  return (
    <div className="h-screen bg-black">
      <KeysProvider>
        <KeysGate>
          <VideoProvider>
            <div className="h-full w-full grid grid-cols-2 grid-rows-1">
              <MainColumn />
              <div className="absolute bottom-2 left-5 text-[0.9rem] text-[#595959] z-10">
                © Ctlst 2026 ® - Your Video Transcriber
              </div>
              <div className="relative h-full min-h-0 overflow-hidden bg-[#0d0d0d] px-20">
                <ReaderPane />
                {/* <AnimatedBg /> */}

                <Graphic />
              </div>
            </div>
          </VideoProvider>
        </KeysGate>
      </KeysProvider>
    </div>
  );
}
