import '@dotnet/jsinterop';
import './GlobalExports';
import * as Environment from './Environment';
import { monoPlatform } from './Platform/Mono/MonoPlatform';
import { renderBatch } from './Rendering/Renderer';
import { SharedMemoryRenderBatch } from './Rendering/RenderBatch/SharedMemoryRenderBatch';
import { Pointer } from './Platform/Platform';
import { shouldAutoStart } from './BootCommon';
import { setEventDispatcher } from './Rendering/RendererEventDispatcher';
import { WebAssemblyResourceLoader } from './Platform/WebAssemblyResourceLoader';

let started = false;

async function boot(options?: any): Promise<void> {

  if (started) {
    throw new Error('Blazor has already started.');
  }
  started = true;

  setEventDispatcher((eventDescriptor, eventArgs) => DotNet.invokeMethodAsync('Microsoft.AspNetCore.Components.WebAssembly', 'DispatchEvent', eventDescriptor, JSON.stringify(eventArgs)));

  // Configure environment for execution under Mono WebAssembly with shared-memory rendering
  const platform = Environment.setPlatform(monoPlatform);
  window['Blazor'].platform = platform;
  window['Blazor']._internal.renderBatch = (browserRendererId: number, batchAddress: Pointer) => {
    renderBatch(browserRendererId, new SharedMemoryRenderBatch(batchAddress));
  };

  // Configure navigation via JS Interop
  window['Blazor']._internal.navigationManager.listenForNavigationEvents(async (uri: string, intercepted: boolean): Promise<void> => {
    await DotNet.invokeMethodAsync(
      'Microsoft.AspNetCore.Components.WebAssembly',
      'NotifyLocationChanged',
      uri,
      intercepted
    );
  });

  // Fetch the resources and prepare the Mono runtime
  const resourceLoader = await WebAssemblyResourceLoader.initAsync();
  try {
    await platform.start(resourceLoader);
  } catch (ex) {
    throw new Error(`Failed to start platform. Reason: ${ex}`);
  }

  // Start up the application
  platform.callEntryPoint(resourceLoader.bootConfig.entryAssembly);
}

window['Blazor'].start = boot;
if (shouldAutoStart()) {
  boot().catch(error => {
    Module.printErr(error); // Logs it, and causes the error UI to appear
  });
}