'use client';

import { useState, useCallback, useEffect } from 'react';
import type { UserProfile, Project } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { initializeFirebase } from '@/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Loader2, History } from 'lucide-react';
import { ProjectCard } from '@/components/history/project-card';
import { ThumbnailCard } from '@/components/history/thumbnail-card';

interface UserProjectHistoryDialogProps {
  user: UserProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserProjectHistoryDialog({ user, open, onOpenChange }: UserProjectHistoryDialogProps) {
  const { firestore } = initializeFirebase();
  const [viewingScript, setViewingScript] = useState<Project | null>(null);
  const [projects, setProjects] = useState<any[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getTimestamp = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'string') return new Date(val).getTime();
    if (val.toDate && typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    return 0;
  };

  const fetchAllProjects = useCallback(async () => {
    if (!firestore || !user?.uid) return;
    setIsLoading(true);
    try {
      let legacyProjs: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'projects'), where('userId', '==', user.uid), limit(50)));
        legacyProjs = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref }));
      } catch (e) {}

      let partitionedProjs: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'projects', user.uid, 'userProjects'), limit(50)));
        partitionedProjs = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref }));
      } catch (e) {}

      let proPartitionedProjs: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'pro_projects', user.uid, 'userProjects'), limit(50)));
        proPartitionedProjs = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref }));
      } catch (e) {}

      let proRootProjs: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'pro_projects'), where('userId', '==', user.uid), limit(50)));
        proRootProjs = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref }));
      } catch (e) {}

      let musicPartitionedProjs: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'music_project', user.uid, 'userProjects'), limit(50)));
        musicPartitionedProjs = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref }));
      } catch (e) {}

      let chatterboxPartitionedProjs: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'chatterbox_projects', user.uid, 'userProjects'), limit(50)));
        chatterboxPartitionedProjs = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref }));
      } catch (e) {}

      let thumbnailsData: any[] = [];
      try {
        const snap = await getDocs(query(collection(firestore, 'users', user.uid, 'thumbnails'), limit(50)));
        thumbnailsData = snap.docs.map(d => ({ ...d.data(), id: d.id, ref: d.ref, itemType: 'thumbnail' }));
      } catch (e) {}

      const combinedMap = new Map();
      [
        ...legacyProjs,
        ...partitionedProjs,
        ...proPartitionedProjs,
        ...proRootProjs,
        ...musicPartitionedProjs,
        ...chatterboxPartitionedProjs,
        ...thumbnailsData
      ].forEach(p => combinedMap.set(p.id, p));

      const finalSorted = Array.from(combinedMap.values())
        .filter((p: any) => !p.userDeleted)
        .sort((a: any, b: any) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));

      setProjects(finalSorted);
    } catch (err) {
      console.error("Error fetching projects in history dialog:", err);
    } finally {
      setIsLoading(false);
    }
  }, [firestore, user?.uid]);

  useEffect(() => {
    if (open) {
      fetchAllProjects();
    }
  }, [open, fetchAllProjects]);

  const handleProjectDeleted = useCallback((projectId: string) => {
    setProjects(prevProjects => prevProjects?.filter(p => p.id !== projectId) || null);
  }, []);

  const handleProjectUpdated = useCallback(() => {
    fetchAllProjects();
  }, [fetchAllProjects]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Project History: {user.name}</DialogTitle>
            <DialogDescription>
              Viewing all projects (Voice, Music, Script & Thumbnails) created by this user.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[60vh] -mx-6 px-6">
            <div className="py-4 space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center h-full py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : projects && projects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map(project => (
                    project.itemType === 'thumbnail' ? (
                      <ThumbnailCard key={project.id} thumbnail={project} />
                    ) : (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onViewProject={setViewingScript}
                        onProjectDeleted={handleProjectDeleted}
                        onProjectUpdated={handleProjectUpdated}
                      />
                    )
                  ))}
                </div>
              ) : (
                <div className="text-center h-48 flex flex-col items-center justify-center text-muted-foreground">
                  <History className="h-12 w-12 mb-4" />
                  <h3 className="font-semibold text-foreground">No Projects Found</h3>
                  <p className="text-sm">This user has not created any projects yet.</p>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for viewing the script */}
      <Dialog open={!!viewingScript} onOpenChange={() => setViewingScript(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Script for: {viewingScript?.projectName}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[50vh] mt-4 p-4 border rounded-md bg-muted/20">
            <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{viewingScript?.script}</pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingScript(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
