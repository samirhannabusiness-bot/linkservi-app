import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

// ─── Query Keys ───────────────────────────────────────────────────────────────
// All keys are nested under ['cohost', ...] for easy bulk-invalidation.
export const cohostKeys = {
  all:          ["cohost"] as const,
  stats:        ["cohost", "stats"] as const,
  workers:      ["cohost", "workers"] as const,
  bookings:     ["cohost", "bookings"] as const,
  products:     ["cohost", "products"] as const,
  orders:       ["cohost", "orders"] as const,
  customOrders: ["cohost", "custom-orders"] as const,
  stores:       ["cohost", "stores"] as const,
  store:        (id: number) => ["cohost", "store", id] as const,
  storeOrders:  (id: number) => ["cohost", "store-orders", id] as const,
};

// ─── Shared fetch helpers ─────────────────────────────────────────────────────
function authGet(url: string) {
  return apiFetch(url, { headers: getAuthHeader() });
}
function authPost(url: string, body?: unknown) {
  return apiFetch(url, {
    method: "POST",
    headers: { ...getAuthHeader(), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
function authPut(url: string, body: unknown) {
  return apiFetch(url, {
    method: "PUT",
    headers: { ...getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function authDelete(url: string) {
  return apiFetch(url, { method: "DELETE", headers: getAuthHeader() });
}

// ─── Error message extractor ──────────────────────────────────────────────────
function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

// ─── READ HOOKS ───────────────────────────────────────────────────────────────

export function useCohostStats() {
  return useQuery({
    queryKey: cohostKeys.stats,
    queryFn: () => authGet("/api/cohost/stats"),
  });
}

export function useCohostWorkers() {
  return useQuery({
    queryKey: cohostKeys.workers,
    queryFn: () => authGet("/api/cohost/workers"),
  });
}

export function useCohostBookings() {
  return useQuery({
    queryKey: cohostKeys.bookings,
    queryFn: () => authGet("/api/cohost/bookings"),
  });
}

export function useCohostProducts() {
  return useQuery({
    queryKey: cohostKeys.products,
    queryFn: () => authGet("/api/cohost/products"),
  });
}

export function useCohostOrders() {
  return useQuery({
    queryKey: cohostKeys.orders,
    queryFn: () => authGet("/api/product-orders/cohost"),
  });
}

export function useCohostCustomOrders() {
  return useQuery({
    queryKey: cohostKeys.customOrders,
    queryFn: () => authGet("/api/custom-orders/cohost"),
    refetchInterval: 30_000,
  });
}

export function useCustomOrderDispatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: number) =>
      authPost(`/api/custom-orders/${orderId}/dispatch`),
    onMutate: async (orderId) => {
      await qc.cancelQueries({ queryKey: cohostKeys.customOrders });
      const previous = qc.getQueryData<any[]>(cohostKeys.customOrders);
      qc.setQueryData<any[]>(cohostKeys.customOrders, (old = []) =>
        old.map((o) => o.id === orderId ? { ...o, status: "dispatched" } : o)
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(cohostKeys.customOrders, ctx?.previous);
      toast({ title: "Error", description: "No se pudo actualizar el pedido.", variant: "destructive" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.customOrders });
    },
    onSuccess: () => {
      toast({ title: "Pedido despachado", description: "El cliente será notificado de que su pedido está en camino." });
    },
  });
}

export function useCohostStores() {
  return useQuery({
    queryKey: cohostKeys.stores,
    queryFn: () => authGet("/api/stores"),
  });
}

export function useStoreDetail(storeId: number) {
  return useQuery({
    queryKey: cohostKeys.store(storeId),
    queryFn: () => authGet(`/api/stores/${storeId}`),
    enabled: !!storeId,
  });
}

export function useStoreOrders(storeId: number) {
  return useQuery({
    queryKey: cohostKeys.storeOrders(storeId),
    queryFn: () => authGet(`/api/stores/${storeId}/orders`),
    enabled: !!storeId,
  });
}

// ─── MUTATION HOOKS ───────────────────────────────────────────────────────────

export function useCreateWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string; email: string; description: string;
      servicePrice: string; categoryId: string; state: string; city: string;
    }) => authPost("/api/cohost/workers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.workers });
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
      toast({ title: "Profesional creado", description: "El profesional fue agregado a tu red." });
    },
    onError: (err) => {
      toast({ title: "Error al crear profesional", description: errMsg(err, "Intenta de nuevo."), variant: "destructive" });
    },
  });
}

export function useDeleteWorker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workerId: number) => authDelete(`/api/cohost/workers/${workerId}`),

    // ── Optimistic: remove immediately from list ──
    onMutate: async (workerId) => {
      await qc.cancelQueries({ queryKey: cohostKeys.workers });
      const previous = qc.getQueryData<any[]>(cohostKeys.workers);
      qc.setQueryData<any[]>(cohostKeys.workers, (old = []) =>
        old.filter((w) => w.id !== workerId)
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      qc.setQueryData(cohostKeys.workers, ctx?.previous);
      toast({ title: "Error al eliminar profesional", description: errMsg(err, "Los cambios fueron revertidos."), variant: "destructive" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.workers });
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
    },
  });
}

export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "accept" | "reject" }) =>
      authPost(`/api/cohost/bookings/${id}/${action}`),

    // ── Optimistic: update booking status immediately ──
    onMutate: async ({ id, action }) => {
      await qc.cancelQueries({ queryKey: cohostKeys.bookings });
      const previous = qc.getQueryData<any[]>(cohostKeys.bookings);
      const newStatus = action === "accept" ? "accepted" : "cancelled";
      qc.setQueryData<any[]>(cohostKeys.bookings, (old = []) =>
        old.map((b) => b.id === id ? { ...b, status: newStatus } : b)
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(cohostKeys.bookings, ctx?.previous);
      toast({ title: "Error al procesar solicitud", description: errMsg(err, "Intenta de nuevo."), variant: "destructive" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.bookings });
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
    },
  });
}

export function useWithdrawCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authPost("/api/cohost/withdraw-product-commission"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
      toast({ title: "Retiro solicitado", description: "El admin procesará tu pago pronto." });
    },
    onError: (err) => {
      toast({ title: "Error al retirar comisiones", description: errMsg(err, "Intenta de nuevo."), variant: "destructive" });
    },
  });
}

export function useCreateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => authPost("/api/stores", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.stores });
      toast({ title: "Tienda creada", description: "Tu tienda ya está lista en ServiMarket." });
    },
    onError: (err) => {
      toast({ title: "Error al crear tienda", description: errMsg(err, "Intenta de nuevo."), variant: "destructive" });
    },
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      authPut(`/api/stores/${id}`, body),

    // ── Optimistic: update store in list immediately ──
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: cohostKeys.stores });
      const previous = qc.getQueryData<any[]>(cohostKeys.stores);
      qc.setQueryData<any[]>(cohostKeys.stores, (old = []) =>
        old.map((s) => s.id === id ? { ...s, ...body } : s)
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(cohostKeys.stores, ctx?.previous);
      toast({ title: "Error al actualizar tienda", description: errMsg(err, "Los cambios fueron revertidos."), variant: "destructive" });
    },
    onSuccess: (_data, vars) => {
      toast({ title: "Tienda actualizada", description: "Los cambios se guardaron correctamente." });
      qc.invalidateQueries({ queryKey: cohostKeys.store(vars.id) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.stores });
    },
  });
}

export function useRequestStoreWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (storeId: number) => authPost(`/api/stores/${storeId}/request-withdrawal`),
    onSuccess: (_data, storeId) => {
      qc.invalidateQueries({ queryKey: cohostKeys.store(storeId) });
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
      toast({ title: "Retiro solicitado", description: "El admin procesará el pago de la tienda." });
    },
    onError: (err) => {
      toast({ title: "Error al solicitar retiro", description: errMsg(err, "Intenta de nuevo."), variant: "destructive" });
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => authPost("/api/products", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.products });
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
      toast({ title: "Producto creado", description: "El producto ya está visible en tu inventario." });
    },
    onError: (err) => {
      toast({ title: "Error al crear producto", description: errMsg(err, "Intenta de nuevo."), variant: "destructive" });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      authPut(`/api/products/${id}`, body),

    // ── Optimistic: update product in list immediately ──
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: cohostKeys.products });
      const previous = qc.getQueryData<any[]>(cohostKeys.products);
      qc.setQueryData<any[]>(cohostKeys.products, (old = []) =>
        old.map((p) => p.id === id ? { ...p, ...body } : p)
      );
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(cohostKeys.products, ctx?.previous);
      toast({ title: "Error al actualizar producto", description: errMsg(err, "Los cambios fueron revertidos."), variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Producto actualizado", description: "Los cambios se guardaron correctamente." });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.products });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => authDelete(`/api/products/${id}`),

    // ── Optimistic: remove immediately from list ──
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: cohostKeys.products });
      const previous = qc.getQueryData<any[]>(cohostKeys.products);
      qc.setQueryData<any[]>(cohostKeys.products, (old = []) =>
        old.filter((p) => p.id !== id)
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      qc.setQueryData(cohostKeys.products, ctx?.previous);
      toast({ title: "Error al eliminar producto", description: errMsg(err, "Los cambios fueron revertidos."), variant: "destructive" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.products });
      qc.invalidateQueries({ queryKey: cohostKeys.stats });
    },
  });
}

export function useOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, endpoint }: { orderId: number; endpoint: string }) =>
      authPost(`/api/product-orders/${orderId}/${endpoint}`),

    // ── Optimistic: update order status immediately ──
    onMutate: async ({ orderId, endpoint }) => {
      await qc.cancelQueries({ queryKey: cohostKeys.orders });
      const previous = qc.getQueryData<any[]>(cohostKeys.orders);
      const STATUS_MAP: Record<string, string> = {
        accept: "accepted", cancel: "cancelled", dispatch: "dispatched",
      };
      const newStatus = STATUS_MAP[endpoint];
      if (newStatus) {
        qc.setQueryData<any[]>(cohostKeys.orders, (old = []) =>
          old.map((o) => o.id === orderId ? { ...o, status: newStatus } : o)
        );
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(cohostKeys.orders, ctx?.previous);
      toast({ title: "Error al actualizar pedido", description: errMsg(err, "Los cambios fueron revertidos."), variant: "destructive" });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cohostKeys.orders });
    },
  });
}
