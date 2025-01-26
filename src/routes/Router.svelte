<script lang="ts">
    import { activePage, type ActivePage, isPage } from "$lib/activePage";
    import { onMount } from "svelte";
    import Home from "$lib/gui/pages/Home.svelte";

    let page = $state<ActivePage>("home");

    onMount(() => {
        activePage.subscribe((newActivePage) => {
            if (newActivePage == null) {
                return;
            }

            page = newActivePage;
        });

        const urlParams = new URLSearchParams(location.search);
        const rawUrlPage = urlParams.get("page") ?? "";
        const urlPage: ActivePage = isPage(rawUrlPage) ? rawUrlPage : "home";
        activePage.set(urlPage);
    });
</script>

{#if page == "home"}
    <Home />
{/if}
