"use client"

import { useState } from "react"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { AdminLayout } from "@/components/admin-layout"
import { useTreatments } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export default function TratamientosPage() {
  const {
    treatments,
    loading,
    addTreatment,
    updateTreatment,
    deleteTreatment,
  } = useTreatments()
  const [newName, setNewName] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const handleAdd = async () => {
    if (newName.trim()) {
      await addTreatment(newName.trim())
      setNewName("")
      setShowAdd(false)
    }
  }

  const handleEdit = async () => {
    if (editId && editName.trim()) {
      await updateTreatment(editId, { name: editName.trim() })
      setEditId(null)
      setEditName("")
    }
  }

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTreatment(deleteId)
      setDeleteId(null)
    }
  }

  const handleToggle = async (id: string, isActive: boolean) => {
    await updateTreatment(id, { is_active: isActive })
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {treatments.length} tratamiento{treatments.length !== 1 ? "s" : ""} en total
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        </div>

        <div className="space-y-2">
          {treatments.map((t) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center justify-between rounded-lg border bg-card px-4 py-3 shadow-sm transition-opacity",
                !t.is_active && "opacity-60"
              )}
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={t.is_active}
                  onCheckedChange={(v) => handleToggle(t.id, v)}
                  aria-label={`Toggle ${t.name}`}
                />
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                {!t.is_active && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Inactivo
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEditId(t.id)
                    setEditName(t.name)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">Editar {t.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteId(t.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Eliminar {t.name}</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo tratamiento</DialogTitle>
            <DialogDescription>Ingresa el nombre del nuevo tratamiento.</DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre del tratamiento"
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleAdd}
              disabled={!newName.trim()}
            >
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={() => setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tratamiento</DialogTitle>
            <DialogDescription>Modifica el nombre del tratamiento.</DialogDescription>
          </DialogHeader>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => e.key === "Enter" && handleEdit()}
            autoFocus
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleEdit}
              disabled={!editName.trim()}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar tratamiento</DialogTitle>
            <DialogDescription>
              Estas segura? Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
