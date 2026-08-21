import MainColumn from "./components/main-column";
import ReaderPane from "./components/reader-pane";
import Graphic from "./components/graphic";
import PageGrid from "./components/page-grid";
import { VideoProvider } from "./context/video-context";
import { KeysProvider } from "./context/keys-context";
import KeysGate from "./components/keys-gate";

export default function Home() {
  return (
    <div className="h-screen bg-black">
      <KeysProvider>
        <KeysGate>
          <VideoProvider>
            <PageGrid>
              <MainColumn />
              <div className="absolute bottom-2 right-5 text-[0.8rem] bg-transparent text-[#5f5f52] z-50">
                © Ctlst 2026 ® - Your Video Transcriber
              </div>
              <div className="relative h-full min-h-0 overflow-hidden bg-[#090912] px-20">
                <ReaderPane />
                {/* <AnimatedBg /> */}
              </div>
            </PageGrid>
          </VideoProvider>
        </KeysGate>
      </KeysProvider>
    </div>
  );
}
