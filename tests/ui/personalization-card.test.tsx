import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/i18n/context";
import { PersonalizationCard } from "@/ui/settings/sections/personalization-card";
import { PersonalizationClientError } from "@/ui/settings/personalization-client";
import * as client from "@/ui/settings/personalization-client";
import { resolveMessage } from "@/i18n/resolve";

vi.mock("@/ui/settings/personalization-client", async (original) => ({
  ...(await original<typeof client>()),
  readPersonalization: vi.fn(),
  replacePersonalization: vi.fn(),
}));
const fields = (nickname = "server") => ({
  nickname,
  occupation: "",
  about: "",
  instructions: "",
});
const snapshot = (nickname = "server", revision = 1) => ({
  personalization: fields(nickname),
  revision,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const mount = () =>
  render(
    <LocaleProvider>
      <PersonalizationCard
        readBoundary={{ admitted: true, subject: "alice", generation: 1 }}
      />
    </LocaleProvider>,
  );
beforeEach(() => {
  window.localStorage.setItem("kokoro.locale", "zh");
  vi.resetAllMocks();
  vi.mocked(client.readPersonalization).mockResolvedValue(snapshot());
});
afterEach(cleanup);

it("keeps failed initial reads locked with no PUT and allows a deliberate read retry", async () => {
  vi.mocked(client.readPersonalization).mockRejectedValueOnce(
    new Error("offline"),
  );
  mount();
  await screen.findByText(/加载失败|无法加载|暂时无法加载/);
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  expect(nickname).toBeDisabled();
  fireEvent.blur(nickname);
  expect(client.replacePersonalization).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await waitFor(() => expect(nickname).toHaveValue("server"));
  expect(nickname).toBeEnabled();
});

it("serializes blur saves while retaining and saving the latest editable draft", async () => {
  const first = deferred<ReturnType<typeof snapshot>>();
  vi.mocked(client.replacePersonalization)
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(snapshot("latest", 3));
  mount();
  const nickname = await screen.findByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "first" } });
  fireEvent.blur(nickname);
  expect(nickname).toBeEnabled();
  fireEvent.change(nickname, { target: { value: "latest" } });
  fireEvent.blur(nickname);
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve(snapshot("first", 2)));
  await waitFor(() =>
    expect(client.replacePersonalization).toHaveBeenCalledTimes(2),
  );
  expect(
    vi.mocked(client.replacePersonalization).mock.calls[1]?.slice(0, 2),
  ).toEqual([fields("latest"), 2]);
  expect(nickname).toHaveValue("latest");
});

it("preserves a conflicting draft and requires reread plus explicit choice before a new CAS write", async () => {
  vi.mocked(client.replacePersonalization)
    .mockRejectedValueOnce(
      new PersonalizationClientError(
        "conflict",
        409,
        "personalization_revision_conflict",
      ),
    )
    .mockResolvedValueOnce(snapshot("mine", 5));
  mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "mine" } });
  fireEvent.blur(nickname);
  await screen.findByRole("button", { name: "重新读取" });
  expect(nickname).toHaveValue("mine");
  fireEvent.blur(nickname);
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
  vi.mocked(client.readPersonalization).mockResolvedValueOnce(
    snapshot("other", 4),
  );
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await screen.findByRole("button", { name: "在新版本上保存我的草稿" });
  expect(nickname).toHaveValue("mine");
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: "在新版本上保存我的草稿" }),
  );
  await waitFor(() =>
    expect(client.replacePersonalization).toHaveBeenCalledTimes(2),
  );
  expect(
    vi.mocked(client.replacePersonalization).mock.calls[1]?.slice(0, 2),
  ).toEqual([fields("mine"), 4]);
});

it("does not retry an unknown PUT outcome on blur and aborts in-flight work on unmount", async () => {
  vi.mocked(client.replacePersonalization).mockRejectedValueOnce(
    new Error("lost ack"),
  );
  const view = mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "mine" } });
  fireEvent.blur(nickname);
  await screen.findByRole("button", { name: "重新读取" });
  fireEvent.blur(nickname);
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(client.readPersonalization).mock.calls[0]?.[0];
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it("adopts the reread server snapshot only when the user chooses it", async () => {
  vi.mocked(client.replacePersonalization).mockRejectedValueOnce(
    new Error("unknown"),
  );
  mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "mine" } });
  fireEvent.blur(nickname);
  await screen.findByRole("button", { name: "重新读取" });
  vi.mocked(client.readPersonalization).mockResolvedValueOnce(
    snapshot("new server", 9),
  );
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await screen.findByRole("button", { name: "采用服务器资料" });
  expect(nickname).toHaveValue("mine");
  fireEvent.click(screen.getByRole("button", { name: "采用服务器资料" }));
  expect(nickname).toHaveValue("new server");
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
});

it("retires old identities immediately and ignores late successful writes", async () => {
  const write = deferred<ReturnType<typeof snapshot>>();
  vi.mocked(client.replacePersonalization).mockReturnValueOnce(write.promise);
  const renderCard = (subject: string, admitted = true) => (
    <LocaleProvider>
      <PersonalizationCard
        readBoundary={{ admitted, subject, generation: 1 }}
      />
    </LocaleProvider>
  );
  const view = render(renderCard("alice"));
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "alice secret" } });
  fireEvent.blur(nickname);
  const signal = vi.mocked(client.replacePersonalization).mock.calls[0]?.[2];
  view.rerender(renderCard("alice", false));
  expect(nickname).toHaveValue("");
  expect(nickname).toBeDisabled();
  expect(signal?.aborted).toBe(true);
  vi.mocked(client.readPersonalization).mockResolvedValueOnce(
    snapshot("bob", 7),
  );
  view.rerender(renderCard("bob"));
  await waitFor(() => expect(nickname).toHaveValue("bob"));
  await act(async () => write.resolve(snapshot("alice secret", 2)));
  expect(nickname).toHaveValue("bob");
  expect(screen.queryByText("已保存")).not.toBeInTheDocument();
});

it("does not overwrite an edited but not yet blurred draft with an earlier ACK", async () => {
  const write = deferred<ReturnType<typeof snapshot>>();
  vi.mocked(client.replacePersonalization).mockReturnValueOnce(write.promise);
  mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "sent" } });
  fireEvent.blur(nickname);
  fireEvent.change(nickname, { target: { value: "typing" } });
  await act(async () => write.resolve(snapshot("sent", 2)));
  expect(nickname).toHaveValue("typing");
  expect(screen.queryByText("已保存")).not.toBeInTheDocument();
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
});

it("keeps a draft when recovery reads fail without replaying the unresolved write", async () => {
  vi.mocked(client.replacePersonalization).mockRejectedValueOnce(
    new Error("lost acknowledgement"),
  );
  mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.change(nickname, { target: { value: "mine" } });
  fireEvent.blur(nickname);
  await screen.findByRole("button", { name: "重新读取" });
  vi.mocked(client.readPersonalization).mockRejectedValueOnce(
    new Error("offline"),
  );
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  await screen.findByRole("button", { name: "重新读取" });
  expect(nickname).toHaveValue("mine");
  fireEvent.blur(nickname);
  expect(client.replacePersonalization).toHaveBeenCalledTimes(1);
});

it("aborts initial GET on unmount and does not let late old reads populate a new identity", async () => {
  const read = deferred<ReturnType<typeof snapshot>>();
  vi.mocked(client.readPersonalization).mockReturnValueOnce(read.promise);
  const view = mount();
  await waitFor(() =>
    expect(client.readPersonalization).toHaveBeenCalledTimes(1),
  );
  const signal = vi.mocked(client.readPersonalization).mock.calls[0]?.[0];
  view.unmount();
  expect(signal?.aborted).toBe(true);
  mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  await act(async () => read.resolve(snapshot("retired secret", 5)));
  expect(nickname).toHaveValue("server");
});

it("does not PUT an unchanged acknowledged profile", async () => {
  mount();
  const nickname = screen.getByRole("textbox", { name: "昵称" });
  await waitFor(() => expect(nickname).toHaveValue("server"));
  fireEvent.blur(nickname);
  expect(client.replacePersonalization).not.toHaveBeenCalled();
});

it.each([
  ["nickname", 0, 128],
  ["occupation", 1, 256],
  ["about", 2, 2000],
  ["instructions", 3, 8000],
] as const)(
  "allows legal supplementary characters without UTF-16 maxlength blocking %s",
  async (field, index, limit) => {
    vi.mocked(client.replacePersonalization).mockImplementation(
      async (value, revision) => ({
        personalization: value,
        revision: revision + 1,
      }),
    );
    mount();
    const input = screen.getAllByRole("textbox")[index]!;
    await waitFor(() =>
      expect(screen.getAllByRole("textbox")[0]).toHaveValue("server"),
    );
    expect(input).not.toHaveAttribute("maxlength");
    const value = "😀".repeat(limit);
    fireEvent.change(input, { target: { value } });
    expect(input).toHaveValue(value);
    fireEvent.change(input, { target: { value: value + "😀" } });
    expect(input).toHaveValue(value);
    fireEvent.blur(input);
    await waitFor(() =>
      expect(client.replacePersonalization).toHaveBeenCalledTimes(1),
    );
    expect(
      vi.mocked(client.replacePersonalization).mock.calls[0]?.[0][field],
    ).toBe(value);
  },
);

it.each([
  ["en", "Reload profile"],
  ["ja", "再読み込み"],
  ["ko", "다시 불러오기"],
  ["es", "Volver a cargar el perfil"],
  ["fr", "Recharger le profil"],
  ["de", "Profil neu laden"],
  ["pt", "Recarregar o perfil"],
  ["ru", "Загрузить профиль заново"],
] as const)(
  "renders translated recovery controls in %s",
  async (locale, label) => {
    window.localStorage.setItem("kokoro.locale", locale);
    vi.mocked(client.readPersonalization).mockRejectedValueOnce(
      new Error("offline"),
    );
    mount();
    await screen.findByRole("button", { name: label });
    const keys = [
      "settings.personalizationUnknown",
      "settings.personalizationReview",
      "settings.personalizationReload",
      "settings.personalizationUseServer",
      "settings.personalizationSaveDraft",
    ] as const;
    for (const key of keys) {
      expect(resolveMessage(locale, key)).not.toBe(resolveMessage("zh", key));
      if (locale !== "en")
        expect(resolveMessage(locale, key)).not.toBe(resolveMessage("en", key));
    }
  },
);
