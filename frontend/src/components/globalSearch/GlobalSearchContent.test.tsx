/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useHistory } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import Pod from '../../lib/k8s/pod';
import { setConfig } from '../../redux/configSlice';
import { initialState as configInitialState } from '../../redux/configSlice';
import { setDetailDrawerEnabled } from '../../redux/drawerModeSlice';
import reducers from '../../redux/reducers/reducers';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import { generateK8sResourceList } from '../../test/mocker';
import { setTheme } from '../App/themeSlice';
import { podList } from '../pod/storyHelper';
import { GlobalSearchContent } from './GlobalSearchContent';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const PREFERRED_DARK_THEME_KEY = 'headlampPreferredDarkTheme';
const REMEMBER_THEME_CHOICES_KEY = 'headlampRememberThemeChoices';

function renderSearch() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext>
        <GlobalSearchContent defaultValue="" maxWidth={500} onBlur={() => {}} />
        <LocationProbe />
      </TestContext>
    </QueryClientProvider>
  );
}
let capturedHistory: ReturnType<typeof useHistory> | undefined;

function LocationProbe() {
  const history = useHistory();
  capturedHistory = history;

  return <div data-testid="current-route">{history.location.pathname}</div>;
}
function createBravoPod() {
  const [pod] = generateK8sResourceList(
    {
      ...podList[5],
      metadata: {
        ...podList[5].metadata,
        name: 'search-test-pod',
        namespace: 'default',
      },
    },
    { instantiateAs: Pod, numResults: 1 }
  );

  pod.cluster = 'bravo';
  return pod;
}
function renderMultiClusterSearch() {
  const alpha = { name: 'alpha', auth_type: '' };
  const bravo = { name: 'bravo', auth_type: '' };

  const testStore = configureStore({
    reducer: reducers,
    preloadedState: {
      config: {
        ...configInitialState,
        clusters: { alpha, bravo },
        allClusters: { alpha, bravo },
      },
    },
  });
  testStore.dispatch(setDetailDrawerEnabled(false));

  render(
    <TestContext store={testStore} routerMap={{ cluster: 'alpha+bravo' }} urlPrefix="/c">
      <QueryClientProvider client={new QueryClient()}>
        <GlobalSearchContent defaultValue="" maxWidth={500} onBlur={() => {}} />

        <LocationProbe />
      </QueryClientProvider>
    </TestContext>
  );
}
async function pickThemeFromSearch(name: string) {
  await userEvent.type(screen.getByRole('combobox'), name);
  await userEvent.click(await screen.findByRole('option', { name: `Theme ${name}` }));
}

describe('GlobalSearchContent theme actions', () => {
  beforeEach(() => {
    localStorage.clear();
    store.dispatch(setTheme('Light'));
  });

  afterEach(() => {
    localStorage.clear();
    store.dispatch(
      setConfig({ clusters: store.getState().config.clusters, forceTheme: undefined })
    );
  });

  it('remembers a theme picked from search as the quick swap preference', async () => {
    renderSearch();

    await pickThemeFromSearch('Lights Out');

    expect(store.getState().theme.name).toBe('Lights Out');
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBe('Lights Out');
  });

  it('does not store a preference when remember mode is off', async () => {
    localStorage.setItem(REMEMBER_THEME_CHOICES_KEY, 'false');
    renderSearch();

    await pickThemeFromSearch('Lights Out');

    expect(store.getState().theme.name).toBe('Lights Out');
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
  });

  it('does not offer to switch themes while a theme is forced', async () => {
    store.dispatch(setConfig({ clusters: store.getState().config.clusters, forceTheme: 'Dark' }));
    renderSearch();

    await userEvent.type(screen.getByRole('combobox'), 'Lights Out');

    await expect(
      screen.findByRole('option', { name: 'Theme Lights Out' }, { timeout: 500 })
    ).rejects.toThrow();
    expect(localStorage.getItem(PREFERRED_DARK_THEME_KEY)).toBeNull();
  });
});
describe('GlobalSearchContent multi-cluster navigation', () => {
  it('opens a Pod in its own cluster', async () => {
    const pod = createBravoPod();
    expect(pod.cluster).toBe('bravo');

    vi.spyOn(Pod, 'useList').mockReturnValue({
      items: [pod],
      isFetching: false,
    } as unknown as ReturnType<typeof Pod.useList>);
    const originalPath = window.location.pathname + window.location.search + window.location.hash;
    try {
      window.history.replaceState({}, '', '/c/alpha+bravo');

      renderMultiClusterSearch();
      expect(capturedHistory?.location.pathname).toBe('/c/alpha+bravo');
      await userEvent.type(screen.getByRole('combobox'), 'search-test-pod');

      const podOption = (
        await screen.findAllByRole('option', {
          name: /search-test-pod/,
        })
      ).find(option => option.textContent?.includes('Pod'));

      expect(podOption).toBeDefined();

      await userEvent.click(podOption!);

      expect(capturedHistory).toBeDefined();
      expect(capturedHistory!.location.pathname).toContain('/c/bravo+alpha/');
    } finally {
      window.history.replaceState({}, '', originalPath);
      vi.restoreAllMocks();
    }
  });
});
